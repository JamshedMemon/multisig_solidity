require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.17",
  mocha: {
    timeout: 40000
  },
  // Add this to ignore Node.js version warning
  ignoreNotSupportedNode: true
};