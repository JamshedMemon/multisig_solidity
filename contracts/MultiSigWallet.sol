// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title MultiSig Wallet
 * @dev A contract that allows k-of-n signers to execute arbitrary methods on arbitrary contracts
 */
contract MultiSigWallet {
    // Events
    event TransactionExecuted(address indexed target, uint256 value, bytes data, uint256 nonce);
    event SignersUpdated(address[] newSigners, uint256 newThreshold);

    // State variables
    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public threshold;    // k - number of signatures required
    uint256 public signerCount;  // n - total number of signers
    uint256 public nonce;        // Global nonce for transaction uniqueness

    // Constants for signature verification
    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    
    bytes32 private constant TX_TYPEHASH = keccak256(
        "Transaction(address target,uint256 value,bytes data,uint256 nonce)"
    );
    
    bytes32 private immutable DOMAIN_SEPARATOR;

    /**
     * @dev Constructor for the MultiSig wallet
     * @param _signers Array of initial signer addresses
     * @param _threshold Number of required signatures (k)
     */
    constructor(address[] memory _signers, uint256 _threshold) {
        require(_signers.length > 0, "Signers array empty");
        require(_threshold > 0 && _threshold <= _signers.length, "Invalid threshold");
        
        // Set up signers
        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            require(signer != address(0), "Invalid signer address");
            require(!isSigner[signer], "Duplicate signer");
            
            signers.push(signer);
            isSigner[signer] = true;
        }
        
        threshold = _threshold;
        signerCount = _signers.length;
        
        // Set up domain separator for EIP-712
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256("MultiSigWallet"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }
    
    /**
     * @dev Computes the hash of the transaction data to be signed
     * @param _target Address of the contract to be called
     * @param _value Amount of ETH to send with the transaction
     * @param _data Function call data
     * @param _nonce Current global nonce
     * @return Transaction hash according to EIP-712
     */
    function getTransactionHash(
        address _target,
        uint256 _value,
        bytes memory _data,
        uint256 _nonce
    ) public view returns (bytes32) {
        bytes32 txHash = keccak256(
            abi.encode(
                TX_TYPEHASH,
                _target,
                _value,
                keccak256(_data),
                _nonce
            )
        );
        
        return keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, txHash)
        );
    }
    
    /**
     * @dev Execute a transaction with multiple signatures
     * @param _target Address of the contract to call
     * @param _value Amount of ETH to send
     * @param _data Function call data
     * @param _signatures Array of signatures from signers
     */
    function executeTransaction(
        address _target,
        uint256 _value,
        bytes memory _data,
        bytes[] memory _signatures
    ) public {
        // Create transaction hash that was signed
        bytes32 txHash = getTransactionHash(_target, _value, _data, nonce);
        
        // Verify signatures meet threshold
        address[] memory recoveredSigners = verifySignatures(txHash, _signatures);
        
        // Increment nonce to prevent replay attacks
        nonce++;
        
        // Execute the transaction
        (bool success, ) = _target.call{value: _value}(_data);
        require(success, "Transaction execution failed");
        
        emit TransactionExecuted(_target, _value, _data, nonce - 1);
    }
    
    /**
     * @dev Verify that we have enough valid signatures from signers
     * @param _txHash Hash of the transaction data to verify
     * @param _signatures Array of signatures to verify
     * @return Array of addresses that were recovered from signatures
     */
    function verifySignatures(
        bytes32 _txHash,
        bytes[] memory _signatures
    ) internal view returns (address[] memory) {
        require(_signatures.length >= threshold, "Not enough signatures");
        
        address[] memory recoveredSigners = new address[](_signatures.length);
        
        // For each signature, recover the signer and verify they are authorized
        for (uint i = 0; i < _signatures.length; i++) {
            address recoveredSigner = recoverSigner(_txHash, _signatures[i]);
            
            // Verify signer is authorized
            require(isSigner[recoveredSigner], "Invalid signer");
            
            // Prevent duplicate signatures (same signer)
            for (uint j = 0; j < i; j++) {
                require(recoveredSigner != recoveredSigners[j], "Duplicate signer");
            }
            
            recoveredSigners[i] = recoveredSigner;
        }
        
        return recoveredSigners;
    }
    
    /**
     * @dev Recover signer address from a signature
     * @param _hash Hash that was signed
     * @param _signature Signature bytes
     * @return Recovered signer address
     */
    function recoverSigner(bytes32 _hash, bytes memory _signature) internal pure returns (address) {
        require(_signature.length == 65, "Invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        // Extract r, s, v from the signature
        assembly {
            r := mload(add(_signature, 32))
            s := mload(add(_signature, 64))
            v := byte(0, mload(add(_signature, 96)))
        }
        
        // Handle Ethereum signed message prefix
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash));
        
        // EIP-2 still allows signature malleability for ecrecover(). Remove this possibility
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert("Invalid signature 's' value");
        }
        
        // v must be 27 or 28
        if (v != 27 && v != 28) {
            revert("Invalid signature 'v' value");
        }
        
        // Recover the signer using the ethSignedMessageHash
        address signer = ecrecover(ethSignedMessageHash, v, r, s);
        require(signer != address(0), "ECDSA: invalid signature");
        
        return signer;
    }
    
    /**
     * @dev Execute a special transaction to update the signer set
     * @param _newSigners Array of new signer addresses
     * @param _newThreshold New threshold value
     * @param _signatures Array of signatures from current signers
     */
    function updateSigners(
        address[] memory _newSigners,
        uint256 _newThreshold,
        bytes[] memory _signatures
    ) public {
        require(_newSigners.length > 0, "Empty signers array");
        require(_newThreshold > 0 && _newThreshold <= _newSigners.length, "Invalid threshold");
        
        // Special call data for updating signers - encode the function selector of this function
        bytes memory data = abi.encodeWithSelector(
            this.updateSigners.selector,
            _newSigners,
            _newThreshold,
            new bytes[](0) // Placeholder for signatures parameter
        );
        
        // Create transaction hash that was signed
        bytes32 txHash = getTransactionHash(address(this), 0, data, nonce);
        
        // Verify signatures from current signers
        verifySignatures(txHash, _signatures);
        
        // Increment nonce
        nonce++;
        
        // Clear current signers
        for (uint i = 0; i < signers.length; i++) {
            isSigner[signers[i]] = false;
        }
        
        // Set up new signers
        delete signers;
        for (uint i = 0; i < _newSigners.length; i++) {
            address signer = _newSigners[i];
            require(signer != address(0), "Invalid signer address");
            require(!isSigner[signer], "Duplicate signer");
            
            signers.push(signer);
            isSigner[signer] = true;
        }
        
        threshold = _newThreshold;
        signerCount = _newSigners.length;
        
        emit SignersUpdated(_newSigners, _newThreshold);
    }
    
    /**
     * @dev Get the list of all current signers
     * @return Array of signer addresses
     */
    function getSigners() public view returns (address[] memory) {
        return signers;
    }
    
    // Receive function to accept ETH
    receive() external payable {}
}