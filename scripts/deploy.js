const hre = require("hardhat");

async function main() {
  const [deployer, account1, account2, account3] = await hre.ethers.getSigners();
  
  console.log("Deploying updated MultiSig wallet with the account:", deployer.address);
  console.log("Account 1:", account1.address);
  console.log("Account 2:", account2.address);
  console.log("Account 3:", account3.address);
  
  // Initial signers
  const signers = [
    deployer.address,
    account1.address,
    account2.address
  ];
  
  // Threshold (k out of n)
  const threshold = 2;
  
  // Admin address
  const admin = deployer.address;
  
  // Deploy the MultiSig contract
  const MultiSigWallet = await hre.ethers.getContractFactory("MultiSigWallet");
  const multisig = await MultiSigWallet.deploy(signers, threshold, admin);
  
  // Wait for deployment to complete
  await multisig.waitForDeployment();
  
  // Get the contract address
  const multisigAddress = await multisig.getAddress();
  
  console.log("Updated MultiSigWallet deployed to:", multisigAddress);
  console.log("Signers:", signers);
  console.log("Threshold:", threshold);
  console.log("Admin:", admin);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});