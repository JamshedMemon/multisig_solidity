const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  const [deployer, account1, account2, account3] = await hre.ethers.getSigners();
  
  // MultiSig contract address - update with your deployed address
  const multisigAddress = "0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44";
  
  // Target address to send ETH
  const targetAddress = account3.address;
  
  // Amount to send (0.1 ETH)
  const value = ethers.parseEther("0.1");
  
  // Empty data for a simple ETH transfer
  const data = "0x";
  
  // Get contract instance
  const multisig = await ethers.getContractAt("MultiSigWallet", multisigAddress);
  
  // Get current nonce
  const nonce = await multisig.nonce();
  console.log("Current nonce:", nonce.toString());
  
  // Get transaction hash
  const txHash = await multisig.getTransactionHash(
    targetAddress,
    value,
    data,
    nonce
  );
  console.log("Transaction hash:", txHash);
  
  // Sign the transaction hash with signers using standard ethers.js signMessage
  console.log("\n--- Using standard ethers.js signMessage ---");
  const signature1 = await deployer.signMessage(ethers.getBytes(txHash));
  const signature2 = await account1.signMessage(ethers.getBytes(txHash));
  
  console.log("Signer 1:", deployer.address);
  console.log("Signature 1:", signature1);
  
  console.log("Signer 2:", account1.address);
  console.log("Signature 2:", signature2);
  
  // Try to verify using the contract's debug function
  try {
    const recovered1 = await multisig.debugRecoverSigner(txHash, signature1);
    console.log("Recovered signer 1:", recovered1);
    console.log("Match:", recovered1.toLowerCase() === deployer.address.toLowerCase());
    
    const recovered2 = await multisig.debugRecoverSigner(txHash, signature2);
    console.log("Recovered signer 2:", recovered2);
    console.log("Match:", recovered2.toLowerCase() === account1.address.toLowerCase());
  } catch (error) {
    console.error("Error recovering signer:", error.message);
  }
  
  // Fund the multisig contract with some ETH
  const fundTx = await deployer.sendTransaction({
    to: multisigAddress,
    value: ethers.parseEther("1.0")
  });
  await fundTx.wait();
  console.log("\nFunded multisig with 1 ETH");
  
  // Execute the transaction
  console.log("\nExecuting transaction with signatures...");
  try {
    const tx = await multisig.executeTransaction(
      targetAddress,
      value,
      data,
      [signature1, signature2]
    );
    
    // Wait for the transaction to be mined
    await tx.wait();
    console.log("Transaction executed successfully!");
    
    // Check recipient balance
    const balance = await ethers.provider.getBalance(targetAddress);
    console.log("Recipient balance:", ethers.formatEther(balance), "ETH");
    
    // Check new nonce
    const newNonce = await multisig.nonce();
    console.log("New nonce:", newNonce.toString());
  } catch (error) {
    console.error("Transaction failed:", error.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});