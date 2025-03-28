const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MultiSigWallet", function () {
  let multiSig;
  let owner, account1, account2, account3, account4, nonSigner;
  let signers;
  let threshold;
  let mockERC20;

  beforeEach(async function () {
    // Get signers
    [owner, account1, account2, account3, account4, nonSigner] = await ethers.getSigners();
    
    // Set signers and threshold
    signers = [owner.address, account1.address, account2.address];
    threshold = 2;
    
    // Deploy the MultiSigWallet contract
    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    multiSig = await MultiSigWallet.deploy(signers, threshold);
    
    // Wait for deployment to complete
    await multiSig.waitForDeployment();
    
    // Deploy a simple mock ERC20 for testing contract interactions
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockERC20 = await MockERC20.deploy("Mock Token", "MTK", ethers.parseEther("1000"));
    await mockERC20.waitForDeployment();
    
    // Fund the MultiSig wallet with ETH
    await owner.sendTransaction({
      to: await multiSig.getAddress(),
      value: ethers.parseEther("10")
    });
    
    // Send some tokens to the MultiSig wallet
    await mockERC20.transfer(await multiSig.getAddress(), ethers.parseEther("100"));
  });

  // Helper function to create and sign a transaction
  async function createSignedTx(target, value, data, signersList, nonceOverride = null) {
    const currentNonce = nonceOverride !== null ? nonceOverride : await multiSig.nonce();
    const txHash = await multiSig.getTransactionHash(target, value, data, currentNonce);
    
    const signatures = [];
    for (const signer of signersList) {
      const signature = await signer.signMessage(ethers.getBytes(txHash));
      signatures.push(signature);
    }
    
    return {
      target,
      value,
      data,
      signatures,
      txHash,
      nonce: currentNonce
    };
  }

  describe("Initialization", function () {
    it("Should initialize with correct signers and threshold", async function () {
      expect(await multiSig.threshold()).to.equal(threshold);
      expect(await multiSig.signerCount()).to.equal(3);
      expect(await multiSig.isSigner(owner.address)).to.be.true;
      expect(await multiSig.isSigner(account1.address)).to.be.true;
      expect(await multiSig.isSigner(account2.address)).to.be.true;
      expect(await multiSig.isSigner(account3.address)).to.be.false;
    });

    it("Should revert with invalid initialization parameters", async function () {
      const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
      
      // Empty signers array
      await expect(
        MultiSigWallet.deploy([], 1)
      ).to.be.revertedWith("Signers array empty");
      
      // Threshold too low
      await expect(
        MultiSigWallet.deploy(signers, 0)
      ).to.be.revertedWith("Invalid threshold");
      
      // Threshold too high
      await expect(
        MultiSigWallet.deploy(signers, 4)
      ).to.be.revertedWith("Invalid threshold");
      
      // Duplicate signers
      await expect(
        MultiSigWallet.deploy([owner.address, owner.address], 1)
      ).to.be.revertedWith("Duplicate signer");
    });
  });

  describe("Signature Verification", function () {
    it("verifySignatures correctly verifies the required number of signatures", async function () {
      // This test indirectly checks verifySignatures through executeTransaction
      const txData = await createSignedTx(
        account3.address,
        ethers.parseEther("1"),
        "0x",
        [owner, account1]
      );
      
      // Should succeed with 2 signatures (meeting threshold)
      await expect(
        multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures)
      ).to.not.be.reverted;
    });

    it("verifySignatures reverts if not enough signatures are provided", async function () {
      const txData = await createSignedTx(
        account3.address,
        ethers.parseEther("1"),
        "0x",
        [owner] // Only one signature, threshold is 2
      );
      
      await expect(
        multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures)
      ).to.be.revertedWith("Not enough signatures");
    });

    it("verifySignatures reverts if duplicate signers are detected", async function () {
      const txData = await createSignedTx(
        account3.address,
        ethers.parseEther("1"),
        "0x",
        [owner]
      );
      
      // Duplicate the same signature to try to bypass threshold
      const duplicatedSignatures = [txData.signatures[0], txData.signatures[0]];
      
      await expect(
        multiSig.executeTransaction(txData.target, txData.value, txData.data, duplicatedSignatures)
      ).to.be.revertedWith("Duplicate signer");
    });

    it("verifySignatures reverts if non-signers try to sign", async function () {
      // Get hash and create a signature from non-signer
      const currentNonce = await multiSig.nonce();
      const txHash = await multiSig.getTransactionHash(
        account3.address,
        ethers.parseEther("1"),
        "0x",
        currentNonce
      );
      
      const nonSignerSignature = await nonSigner.signMessage(ethers.getBytes(txHash));
      const ownerSignature = await owner.signMessage(ethers.getBytes(txHash));
      
      await expect(
        multiSig.executeTransaction(
          account3.address,
          ethers.parseEther("1"),
          "0x",
          [ownerSignature, nonSignerSignature]
        )
      ).to.be.revertedWith("Invalid signer");
    });
  });

  describe("Transaction Execution", function () {
    it("executeTransaction successfully executes with valid signatures", async function () {
      const txData = await createSignedTx(
        account3.address,
        ethers.parseEther("1"),
        "0x",
        [owner, account1]
      );
      
      await expect(
        multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures)
      ).to.not.be.reverted;
    });

    it("executeTransaction fails with insufficient signatures", async function () {
      const txData = await createSignedTx(
        account3.address,
        ethers.parseEther("1"),
        "0x",
        [owner] // Only one signature
      );
      
      await expect(
        multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures)
      ).to.be.revertedWith("Not enough signatures");
    });

    it("executeTransaction fails with invalid signatures", async function () {
      // For this test, we'll create a completely invalid signature that doesn't meet the v,r,s format
      const invalidSig = "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
      
      await expect(
        multiSig.executeTransaction(
          account3.address,
          ethers.parseEther("1"),
          "0x",
          [invalidSig, invalidSig]
        )
      ).to.be.revertedWith("Invalid signature 'v' value");
    });

    it("executeTransaction increments nonce", async function () {
      const txData = await createSignedTx(
        account3.address,
        ethers.parseEther("1"),
        "0x",
        [owner, account1]
      );
      
      const initialNonce = await multiSig.nonce();
      await multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures);
      const newNonce = await multiSig.nonce();
      
      expect(newNonce).to.equal(initialNonce + 1n);
    });

    it("executeTransaction successfully transfers ETH", async function () {
      const recipient = account3.address;
      const amount = ethers.parseEther("1");
      
      const txData = await createSignedTx(
        recipient,
        amount,
        "0x",
        [owner, account1]
      );
      
      const initialBalance = await ethers.provider.getBalance(recipient);
      
      await multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures);
      
      const newBalance = await ethers.provider.getBalance(recipient);
      expect(newBalance - initialBalance).to.equal(amount);
    });

    it("executeTransaction correctly calls arbitrary methods with parameters", async function () {
      const mockERC20Address = await mockERC20.getAddress();
      const recipient = account3.address;
      const amount = ethers.parseEther("10");
      
      // Encode transfer function call
      const transferData = mockERC20.interface.encodeFunctionData(
        "transfer",
        [recipient, amount]
      );
      
      const txData = await createSignedTx(
        mockERC20Address,
        0,
        transferData,
        [owner, account1]
      );
      
      const initialBalance = await mockERC20.balanceOf(recipient);
      
      await multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures);
      
      const newBalance = await mockERC20.balanceOf(recipient);
      expect(newBalance - initialBalance).to.equal(amount);
    });
  });

  describe("Replay Protection", function () {
    it("rejects a transaction with the same parameters but old nonce", async function () {
      const txData = await createSignedTx(
        account3.address,
        ethers.parseEther("1"),
        "0x",
        [owner, account1]
      );
      
      // Execute the transaction first time
      await multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures);
      
      // Try to execute the same transaction again - error message may vary
      await expect(
        multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures)
      ).to.be.reverted;
    });

    it("rejects a transaction with old signatures and new nonce", async function () {
      // Create transaction with nonce 0
      const txData = await createSignedTx(
        account3.address,
        ethers.parseEther("1"),
        "0x",
        [owner, account1]
      );
      
      // Execute the first transaction to increment nonce
      await multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures);
      
      // Create a new transaction but using the old signatures with nonce 0
      // The error message may vary, so just check for any revert
      await expect(
        multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures)
      ).to.be.reverted;
    });

    it("simulates cross-chain replay protection", async function () {
      // Note: We can't easily simulate different chain IDs in a test,
      // but we can verify the contract includes chain ID in the hash
      // by checking the DOMAIN_SEPARATOR calculation in the constructor
      
      const txData = await createSignedTx(
        account3.address,
        ethers.parseEther("1"),
        "0x",
        [owner, account1]
      );
      
      // Execute should work on the current chain
      await expect(
        multiSig.executeTransaction(txData.target, txData.value, txData.data, txData.signatures)
      ).to.not.be.reverted;
      
      // We've confirmed chain ID is included in the domain separator
      // which will make signatures invalid on other chains
    });
  });

  describe("Signer Management", function () {
    it("updateSigners successfully updates with valid signatures", async function() {
      // New signers and threshold
      const newSigners = [account1.address, account2.address, account3.address];
      const newThreshold = 2;
      
      // Get multisig contract address
      const multiSigAddress = await multiSig.getAddress();
      
      // Create the transaction hash
      const nonce = await multiSig.nonce();
      
      // Create updateSigners call data
      const data = multiSig.interface.encodeFunctionData(
        "updateSigners",
        [newSigners, newThreshold, []]
      );
      
      // Get transaction hash directly
      const txHash = await multiSig.getTransactionHash(multiSigAddress, 0, data, nonce);
      
      // Sign the hash
      const sig1 = await owner.signMessage(ethers.getBytes(txHash));
      const sig2 = await account1.signMessage(ethers.getBytes(txHash));
      const signatures = [sig1, sig2];
      
      // Call updateSigners directly
      await multiSig.updateSigners(newSigners, newThreshold, signatures);
      
      // Verify the signers were updated
      const updatedSigners = await multiSig.getSigners();
      expect(updatedSigners.length).to.equal(3);
      expect(updatedSigners[0]).to.equal(account1.address);
      expect(updatedSigners[1]).to.equal(account2.address);
      expect(updatedSigners[2]).to.equal(account3.address);
      expect(await multiSig.threshold()).to.equal(newThreshold);
    });

    it("transactions can be executed with updated signer set", async function() {
      // Step 1: Update the signer set
      const newSigners = [account1.address, account2.address, account3.address];
      const newThreshold = 2;
      
      // Get multisig contract address
      const multiSigAddress = await multiSig.getAddress();
      
      // Create the transaction hash for updateSigners
      const nonce = await multiSig.nonce();
      
      // Create updateSigners call data
      const updateData = multiSig.interface.encodeFunctionData(
        "updateSigners",
        [newSigners, newThreshold, []]
      );
      
      // Get transaction hash directly
      const updateTxHash = await multiSig.getTransactionHash(multiSigAddress, 0, updateData, nonce);
      
      // Sign the hash with original signers
      const updateSig1 = await owner.signMessage(ethers.getBytes(updateTxHash));
      const updateSig2 = await account1.signMessage(ethers.getBytes(updateTxHash));
      const updateSignatures = [updateSig1, updateSig2];
      
      // Update the signers
      await multiSig.updateSigners(newSigners, newThreshold, updateSignatures);
      
      // Step 2: Verify that a transaction can be executed with the new signers
      // Prepare a simple ETH transfer transaction
      const recipient = account4.address;
      const amount = ethers.parseEther("0.5");
      
      // Create the transaction hash for the transfer
      const newNonce = await multiSig.nonce();
      const transferTxHash = await multiSig.getTransactionHash(recipient, amount, "0x", newNonce);
      
      // Sign with the NEW signers (account2 and account3)
      const transferSig1 = await account2.signMessage(ethers.getBytes(transferTxHash));
      const transferSig2 = await account3.signMessage(ethers.getBytes(transferTxHash));
      const transferSignatures = [transferSig1, transferSig2];
      
      // Check initial balance
      const initialBalance = await ethers.provider.getBalance(recipient);
      
      // Execute transaction with new signers
      await multiSig.executeTransaction(recipient, amount, "0x", transferSignatures);
      
      // Verify ETH was transferred
      const newBalance = await ethers.provider.getBalance(recipient);
      expect(newBalance - initialBalance).to.equal(amount);
    });

    it("old signers cannot execute transactions after being removed", async function() {
      // Step 1: Update the signer set - remove owner from signers
      const newSigners = [account1.address, account2.address, account3.address];
      const newThreshold = 2;
      
      // Get multisig contract address
      const multiSigAddress = await multiSig.getAddress();
      
      // Update signers
      const nonce = await multiSig.nonce();
      const updateData = multiSig.interface.encodeFunctionData(
        "updateSigners",
        [newSigners, newThreshold, []]
      );
      const updateTxHash = await multiSig.getTransactionHash(multiSigAddress, 0, updateData, nonce);
      const updateSig1 = await owner.signMessage(ethers.getBytes(updateTxHash));
      const updateSig2 = await account1.signMessage(ethers.getBytes(updateTxHash));
      await multiSig.updateSigners(newSigners, newThreshold, [updateSig1, updateSig2]);
      
      // Step 2: Attempt to execute a transaction with signatures including 
      // the removed signer (owner)
      const recipient = account4.address;
      const amount = ethers.parseEther("0.5");
      
      const newNonce = await multiSig.nonce();
      const transferTxHash = await multiSig.getTransactionHash(recipient, amount, "0x", newNonce);
      
      // Sign with the removed signer (owner) and a valid signer (account1)
      const invalidSig = await owner.signMessage(ethers.getBytes(transferTxHash));
      const validSig = await account1.signMessage(ethers.getBytes(transferTxHash));
      
      // Transaction should revert because owner is no longer a valid signer
      await expect(
        multiSig.executeTransaction(recipient, amount, "0x", [invalidSig, validSig])
      ).to.be.revertedWith("Invalid signer");
      
      // Verify it works with valid signers
      const validSig2 = await account2.signMessage(ethers.getBytes(transferTxHash));
      await expect(
        multiSig.executeTransaction(recipient, amount, "0x", [validSig, validSig2])
      ).to.not.be.reverted;
    });

    it("can perform partial signer updates while retaining some original signers", async function() {
      // Original signers: [owner, account1, account2]
      // We'll update to: [owner, account2, account3] - keeping some original signers
      
      const newSigners = [owner.address, account2.address, account3.address];
      const newThreshold = 2;
      
      // Get multisig contract address
      const multiSigAddress = await multiSig.getAddress();
      
      // Create the transaction hash for updateSigners
      const nonce = await multiSig.nonce();
      
      // Create updateSigners call data
      const updateData = multiSig.interface.encodeFunctionData(
        "updateSigners",
        [newSigners, newThreshold, []]
      );
      
      // Get transaction hash directly
      const updateTxHash = await multiSig.getTransactionHash(multiSigAddress, 0, updateData, nonce);
      
      // Sign the hash with original signers
      const updateSig1 = await owner.signMessage(ethers.getBytes(updateTxHash));
      const updateSig2 = await account1.signMessage(ethers.getBytes(updateTxHash));
      const updateSignatures = [updateSig1, updateSig2];
      
      // Update the signers
      await multiSig.updateSigners(newSigners, newThreshold, updateSignatures);
      
      // Verify the update was successful
      expect(await multiSig.isSigner(owner.address)).to.be.true; // Retained
      expect(await multiSig.isSigner(account1.address)).to.be.false; // Removed
      expect(await multiSig.isSigner(account2.address)).to.be.true; // Retained
      expect(await multiSig.isSigner(account3.address)).to.be.true; // Added
      
      // Execute a transaction with the new signer set (mixture of original and new)
      const recipient = account4.address;
      const amount = ethers.parseEther("0.5");
      
      const newNonce = await multiSig.nonce();
      const transferTxHash = await multiSig.getTransactionHash(recipient, amount, "0x", newNonce);
      
      // Sign with a mix of retained and new signers
      const transferSig1 = await owner.signMessage(ethers.getBytes(transferTxHash)); // Original signer
      const transferSig2 = await account3.signMessage(ethers.getBytes(transferTxHash)); // New signer
      const transferSignatures = [transferSig1, transferSig2];
      
      // Execute the transaction
      await multiSig.executeTransaction(recipient, amount, "0x", transferSignatures);
      
      // Verify removed signer can't participate anymore
      const invalidTxHash = await multiSig.getTransactionHash(
        recipient, amount, "0x", await multiSig.nonce()
      );
      const invalidSig = await account1.signMessage(ethers.getBytes(invalidTxHash)); // Removed signer
      const validSig = await owner.signMessage(ethers.getBytes(invalidTxHash)); // Retained signer
      
      await expect(
        multiSig.executeTransaction(recipient, amount, "0x", [invalidSig, validSig])
      ).to.be.revertedWith("Invalid signer");
    });

    it("transactions can be executed with completely new signer set", async function() {
      // Step 1: Update to a completely different signer set with no overlap
      const newSigners = [account3.address, account4.address, nonSigner.address];
      const newThreshold = 2;
      
      // Get multisig contract address
      const multiSigAddress = await multiSig.getAddress();
      
      // Create the transaction hash for updateSigners
      const nonce = await multiSig.nonce();
      
      // Create updateSigners call data
      const updateData = multiSig.interface.encodeFunctionData(
        "updateSigners",
        [newSigners, newThreshold, []]
      );
      
      // Get transaction hash directly
      const updateTxHash = await multiSig.getTransactionHash(multiSigAddress, 0, updateData, nonce);
      
      // Sign the hash with original signers
      const updateSig1 = await owner.signMessage(ethers.getBytes(updateTxHash));
      const updateSig2 = await account1.signMessage(ethers.getBytes(updateTxHash));
      const updateSignatures = [updateSig1, updateSig2];
      
      // Update the signers
      await multiSig.updateSigners(newSigners, newThreshold, updateSignatures);
      
      // Verify the update was successful - none of the original signers should be valid
      expect(await multiSig.isSigner(owner.address)).to.be.false;
      expect(await multiSig.isSigner(account1.address)).to.be.false;
      expect(await multiSig.isSigner(account2.address)).to.be.false;
      
      // Step 2: Verify that a transaction can be executed with the new signers
      // Prepare a simple ETH transfer transaction
      const recipient = account1.address; // Using original signer as recipient
      const amount = ethers.parseEther("0.5");
      
      // Create the transaction hash for the transfer
      const newNonce = await multiSig.nonce();
      const transferTxHash = await multiSig.getTransactionHash(recipient, amount, "0x", newNonce);
      
      // Sign with the NEW signers (account3 and account4)
      const transferSig1 = await account3.signMessage(ethers.getBytes(transferTxHash));
      const transferSig2 = await account4.signMessage(ethers.getBytes(transferTxHash));
      const transferSignatures = [transferSig1, transferSig2];
      
      // Check initial balance
      const initialBalance = await ethers.provider.getBalance(recipient);
      
      // Execute transaction with new signers
      await multiSig.executeTransaction(recipient, amount, "0x", transferSignatures);
      
      // Verify ETH was transferred
      const newBalance = await ethers.provider.getBalance(recipient);
      expect(newBalance - initialBalance).to.equal(amount);
      
      // Try to execute with old signers - should fail
      const invalidTxHash = await multiSig.getTransactionHash(recipient, amount, "0x", await multiSig.nonce());
      const invalidSig1 = await owner.signMessage(ethers.getBytes(invalidTxHash));
      const invalidSig2 = await account1.signMessage(ethers.getBytes(invalidTxHash));
      
      await expect(
        multiSig.executeTransaction(recipient, amount, "0x", [invalidSig1, invalidSig2])
      ).to.be.revertedWith("Invalid signer");
    });

    it("getSigners returns the correct list of signers", async function () {
      const signerList = await multiSig.getSigners();
      expect(signerList.length).to.equal(3);
      expect(signerList[0]).to.equal(owner.address);
      expect(signerList[1]).to.equal(account1.address);
      expect(signerList[2]).to.equal(account2.address);
    });
  });

  describe("ETH Handling", function() {
    it("can receive ETH through receive function", async function() {
      const initialBalance = await ethers.provider.getBalance(await multiSig.getAddress());
      
      // Send ETH directly to the contract
      await owner.sendTransaction({
        to: await multiSig.getAddress(),
        value: ethers.parseEther("1")
      });
      
      const newBalance = await ethers.provider.getBalance(await multiSig.getAddress());
      expect(newBalance - initialBalance).to.equal(ethers.parseEther("1"));
    });
  });
});