const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  const [deployer, account1, account2, account3] = await hre.ethers.getSigners();
  
  // MultiSig contract address (replace with your deployed address)
  const multisigAddress = "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0";
  
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
  
  // Convert the hash to bytes
  const messageHashBytes = ethers.getBytes(txHash);
  
  // Sign the transaction hash - using signMessage directly adds the Ethereum prefix,
  // which differs from our contract's expectations
  // Instead, we need to sign the raw digest
  
  // Get raw private keys
  const [deployerWallet, account1Wallet] = [
    new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"),
    new ethers.Wallet(process.env.ACCOUNT1_PRIVATE_KEY || "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d")
  ];
  
  // Sign the digest directly
  const deployerSignature = await deployerWallet.signMessage(messageHashBytes);
  const account1Signature = await account1Wallet.signMessage(messageHashBytes);
  
  console.log("Signer 1 address:", deployerWallet.address);
  console.log("Signature 1:", deployerSignature);
  
  console.log("Signer 2 address:", account1Wallet.address);
  console.log("Signature 2:", account1Signature);
  
  // Fund the multisig contract with some ETH first
  const fundTx = await deployer.sendTransaction({
    to: multisigAddress,
    value: ethers.parseEther("1.0")
  });
  await fundTx.wait();
  console.log("Funded multisig with 1 ETH");
  
  // Execute the transaction
  console.log("Executing transaction...");
  const tx = await multisig.executeTransaction(
    targetAddress,
    value,
    data,
    [deployerSignature, account1Signature]
  );
  
  // Wait for the transaction to be mined
  await tx.wait();
  
  console.log("Transaction executed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});