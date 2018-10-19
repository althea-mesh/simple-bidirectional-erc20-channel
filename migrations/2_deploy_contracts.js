/* globals artifacts, web3 */
const ChannelManager = artifacts.require('./ChannelManager.sol')
const ECTools = artifacts.require('./ECTools.sol')
const SimpleToken = artifacts.require('./SimpleToken.sol')

module.exports = (deployer, network, accounts) => {
  deployer.deploy(ECTools)
  deployer.link(ECTools, ChannelManager)
  deployer.deploy(ChannelManager)
  deployer.deploy(SimpleToken).then(async () => {
    const simpleToken = await SimpleToken.deployed()
    simpleToken.transfer(accounts[1], web3.utils.toWei('5000', 'ether'))
  })
}
