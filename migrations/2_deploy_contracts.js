/* globals artifacts */
const ChannelManager = artifacts.require('./ChannelManager.sol')
const ECTools = artifacts.require('./ECTools.sol')

module.exports = function (deployer) {
  deployer.deploy(ECTools)
  deployer.link(ECTools, ChannelManager)
  deployer.deploy(ChannelManager)
}
