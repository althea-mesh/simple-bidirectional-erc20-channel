/* globals artifacts */
const ChannelManager = artifacts.require('./ChannelManager.sol')
const ECTools = artifacts.require('./ECTools.sol')
const SimpleToken = artifacts.require('./SimpleToken.sol')

module.exports = function (deployer) {
  deployer.deploy(ECTools)
  deployer.link(ECTools, ChannelManager)
  deployer.deploy(ChannelManager)
  deployer.deploy(SimpleToken)
}
