# Decentralized MultiSig Wallet

A secure, fully decentralized Ethereum multisignature wallet contract that allows k-of-n signers to execute arbitrary transactions.

## Overview

This MultiSig wallet enables a group of authorized signers to collectively control assets and execute transactions on the Ethereum blockchain. It requires a configurable threshold (k) of signers from a total set (n) to approve any transaction, providing enhanced security compared to single-signature wallets.

The wallet is designed with decentralization as its core principle - there are no special admin privileges. All governance changes, including updating the signer set, require consensus from the current signers.

## Features

- **K-of-N Authorization**: Configurable threshold (k) required from the total set of signers (n)
- **Arbitrary Transaction Execution**: Execute any function on any contract with the required signatures
- **Secure Signer Management**: Update the signer set through multi-signature consensus
- **Replay Protection**: Prevents signature reuse through nonce management and domain separation
- **Cross-Chain Security**: Chain ID integration prevents replay attacks across networks
- **Wallet-Friendly Signatures**: Compatible with standard wallet signing methods

## Signature Scheme

This contract uses a hybrid approach to signatures that prioritizes compatibility with standard wallet interfaces:

1. **Transaction hashing**: Uses EIP-712 structured data format with domain separator to generate the transaction hash
2. **Signature verification**: Applies the Ethereum Signed Message prefix (`"\x19Ethereum Signed Message:\n32"`) during recovery

This approach allows signers to use standard wallet signing methods (like MetaMask or `eth_sign`) rather than requiring custom signing implementations. While it's not a pure EIP-712 implementation, it provides the security benefits of domain separation while maintaining compatibility with commonly available signing interfaces.

When collecting signatures, you should:
- Use the `getTransactionHash` function to generate the hash
- Have signers sign this hash using their wallet's standard signing method (e.g., `personal_sign` or `signMessage` in ethers.js)
- Do NOT use `eth_signTypedData` as the contract expects the Ethereum message prefix

This design decision prioritizes ease of integration with wallets and frontend applications over strict EIP-712 compliance.

## Contract Functions

### Constructor

```solidity
constructor(address[] memory _signers, uint256 _threshold)
```

Initializes the MultiSig wallet with the initial set of signers and threshold.

- `_signers`: Array of initial signer addresses
- `_threshold`: Number of required signatures (k)

Requirements:
- Signers array must not be empty
- Threshold must be > 0 and <= number of signers
- No duplicate or zero addresses in signers array

### executeTransaction

```solidity
function executeTransaction(
    address _target,
    uint256 _value,
    bytes memory _data,
    bytes[] memory _signatures
) public
```

Executes a transaction after verifying sufficient valid signatures.

- `_target`: Address of contract or account to interact with
- `_value`: Amount of ETH to send (in wei)
- `_data`: Function call data for the target contract
- `_signatures`: Array of signatures from authorized signers

Requirements:
- Number of valid signatures must meet or exceed the threshold
- Signatures must come from authorized signers
- No duplicate signatures allowed

### updateSigners

```solidity
function updateSigners(
    address[] memory _newSigners,
    uint256 _newThreshold,
    bytes[] memory _signatures
) public
```

Updates the set of authorized signers and/or threshold.

- `_newSigners`: New array of signer addresses
- `_newThreshold`: New threshold value
- `_signatures`: Signatures from current signers authorizing the change

Requirements:
- Signatures must meet current threshold
- New signers array must not be empty
- New threshold must be > 0 and <= number of new signers

### getTransactionHash

```solidity
function getTransactionHash(
    address _target,
    uint256 _value,
    bytes memory _data,
    uint256 _nonce
) public view returns (bytes32)
```

Generates a hash of transaction data to be signed by signers.

- `_target`: Target address for the transaction
- `_value`: ETH value to send
- `_data`: Call data for the transaction
- `_nonce`: Current nonce from the contract

Returns:
- Hash to be signed using standard wallet signing methods

### getSigners

```solidity
function getSigners() public view returns (address[] memory)
```

Returns the current list of authorized signers.

### State Variables

- `threshold`: The number of signatures required (k)
- `signerCount`: Total number of authorized signers (n)
- `nonce`: Current transaction nonce (increments with each transaction)
- `isSigner`: Mapping to check if an address is an authorized signer

## How to Use

### Deploying the Contract

1. Deploy the contract with initial signers and threshold:
   ```solidity
   MultiSigWallet wallet = new MultiSigWallet([address1, address2, address3], 2);
   ```

### Funding the Wallet

The wallet can receive ETH directly through:
- Regular transfers to the contract address
- Transactions with ETH value sent to the contract

### Executing Transactions

1. Get the current nonce from the contract:
   ```javascript
   const nonce = await multiSig.nonce();
   ```

2. Generate the transaction hash to be signed:
   ```javascript
   const txHash = await multiSig.getTransactionHash(
     targetAddress,
     value,
     data,
     nonce
   );
   ```

3. Collect signatures off-chain from authorized signers using standard wallet signing:
   ```javascript
   // Example with ethers.js - THIS IS THE CORRECT WAY
   const signature1 = await signer1.signMessage(ethers.utils.arrayify(txHash));
   const signature2 = await signer2.signMessage(ethers.utils.arrayify(txHash));
   const signatures = [signature1, signature2];
   
   // DO NOT use signTypedData as the contract expects the Ethereum message prefix
   ```

4. Execute the transaction by providing the transaction details and signatures:
   ```javascript
   await multiSig.executeTransaction(
     targetAddress,
     value,
     data,
     signatures
   );
   ```

### Updating Signers

1. Generate the transaction hash for the signer update:
   ```javascript
   const data = multiSig.interface.encodeFunctionData(
     "updateSigners",
     [newSigners, newThreshold, []]
   );
   const txHash = await multiSig.getTransactionHash(
     multiSigAddress,
     0,
     data,
     nonce
   );
   ```

2. Collect signatures from current signers meeting the threshold (using standard wallet signing)

3. Call the updateSigners function:
   ```javascript
   await multiSig.updateSigners(
     newSigners,
     newThreshold,
     signatures
   );
   ```

## Security Considerations

- **Private Key Security**: All signers must maintain strict security of their private keys
- **Threshold Management**: Set an appropriate threshold balancing security with operational practicality
- **Signature Collection**: Implement secure off-chain mechanisms for collecting signatures
- **Nonce Tracking**: Always use the latest nonce when creating transaction hashes
- **Signature Method**: Use the correct signature method (standard wallet signing) to ensure compatibility

## Development and Testing

The contract includes comprehensive tests covering:
- Signature verification
- Transaction execution
- Signer management
- Governance transitions
- Replay protection

Run the tests with:
```
npx hardhat test
```

## License

This project is licensed under the MIT License.
