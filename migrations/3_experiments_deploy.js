/* globals artifacts, web3 */
const JehansExperiment = artifacts.require('./JehansExperiment.sol')
const ECTools = artifacts.require('./ECTools.sol')
const SimpleToken = artifacts.require('./SimpleToken.sol')

module.exports = (deployer, network, accounts) => {
  deployer.deploy(ECTools)
  deployer.link(ECTools, JehansExperiment)
  deployer.deploy(JehansExperiment)
}
