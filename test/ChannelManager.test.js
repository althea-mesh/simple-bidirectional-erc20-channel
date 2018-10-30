const ChannelManager = artifacts.require("./ChannelManager.sol")

const {
  ACCT_0,
  ACCT_1,
  CHANNEL_STATUS,
  ZERO
} = require("./constants.js")

const {
  toBN,
  log,
  takeSnapshot,
  revertSnapshot,
  openChannel,
  checkBalanceAfterGas,
  provider,
  channelStateAsserts,
  joinChannel,
  openJoin,
  sign,
} = require("./utils.js")

contract("ChannelManager", () => {

  let channelManager
  before(async () => {
    channelManager = await ChannelManager.deployed()
  })

  context('newChannel', async () => {
    it("newChannel", async () => {
      const snapshot = await takeSnapshot()

      const deposit = toBN(web3.utils.toWei('10', "ether"))
      const challengePeriod = 6000

      let oldBalance = toBN(await provider.getBalance(ACCT_0.address))
      let txn = await openChannel({
        instance: channelManager,
        channelCreator: ACCT_0.address,
        to: ACCT_1.address,
        deposit: deposit,
        challengePeriod: challengePeriod,
      })
      await checkBalanceAfterGas(txn, oldBalance)

      await channelStateAsserts({
        instance: channelManager,
        agentA: ACCT_0.address,
        agentB: ACCT_1.address,
        expectedDeposit0: deposit,
        expectedBalance0: deposit,
        channelStatus: CHANNEL_STATUS.OPEN,
        challengePeriod: challengePeriod 
      })

      await revertSnapshot(snapshot)
    })
  })

  context('joinChannel', async () => {
    it("no new deposit", async () => {
      const snapshot = await takeSnapshot()

      const deposit0 = toBN(web3.utils.toWei('10', "ether"))
      const deposit1 = toBN(web3.utils.toWei('3.1459', "ether"))
      const challengePeriod = 6000

      let oldBalance = toBN(await provider.getBalance(ACCT_0.address))
      let txn = await openChannel({
        instance: channelManager,
        channelCreator: ACCT_0.address,
        to: ACCT_1.address,
        deposit: deposit0,
        challengePeriod: challengePeriod,
      })
      await checkBalanceAfterGas(txn, oldBalance)

      await joinChannel({
        instance: channelManager,
        agentA: ACCT_0.address,
        agentB: ACCT_1.address,
        deposit: deposit1,
      })

      await channelStateAsserts({
        instance: channelManager,
        expectedDeposit0: deposit0,
        expectedDeposit1: deposit1,
        expectedBalance0: deposit0,
        expectedBalance1: deposit1,
        channelStatus: CHANNEL_STATUS.JOINED,
        challengePeriod: challengePeriod 
      })

      await revertSnapshot(snapshot)
    })
  })

  context('updateState', async () => {
    it("updateState", async () => {
      const snapshot = await takeSnapshot()

      const deposit0 = await toBN(web3.utils.toWei('10', "ether"))
      const deposit1 = await toBN(web3.utils.toWei('3', "ether"))
      const challengePeriod= 6000

      await openJoin({
        instance: channelManager,
        challengePeriod: challengePeriod,
        deposit0: deposit0,
        deposit1: deposit1,
      })

      const activeId = await channelManager.activeIds.call(
        ACCT_0.address,
        ACCT_1.address,
        ZERO
      )
      
      const newBalance0 = deposit0.sub(
        await toBN(await web3.utils.toWei('1', "ether"))
      )
      const newBalance1 = deposit1.add(
        await toBN(await web3.utils.toWei('1', "ether"))
      )

      let updateNonce = 1 // update with higher nonce
      let fingerprint = await web3.utils.soliditySha3(
        activeId,
        updateNonce,
        newBalance0,
        newBalance1,
      )

      let sig0 = await sign(ACCT_0, fingerprint)
      let sig1 = await sign(ACCT_1, fingerprint)
      assert(await channelManager.isValidStateUpdate(
        activeId,
        updateNonce,
        newBalance0,
        newBalance1,
        sig0,
        sig1,
        true,
        true,
        { from: ACCT_1.address }
      ))

      await channelManager.updateState(
        activeId,
        updateNonce,
        newBalance0,
        newBalance1,
        sig0,
        sig1,
        { from: ACCT_0.address }
      )

      await channelStateAsserts({
        instance: channelManager,
        agentA: ACCT_0.address,
        agentB: ACCT_1.address,
        channelNonce: updateNonce,
        expectedDeposit0: deposit0,
        expectedBalance0: newBalance0,  
        expectedDeposit1: deposit1,
        expectedBalance1: newBalance1,  
        channelStatus: CHANNEL_STATUS.JOINED,
        challengePeriod: challengePeriod 
      })

      await revertSnapshot(snapshot)
    })
  })

  context('newChannel', async () => {
    it("eth opened but not joined", async () => {
      const snapshot = await takeSnapshot()

      let oldBalance = toBN(await provider.getBalance(ACCT_0.address))
      let deposit = toBN(web3.utils.toWei('1', "ether"))
      const challengePeriod = 6000

      let txn = await openChannel({
        instance: channelManager,
        channelCreator: ACCT_0.address,
        to: ACCT_1.address,
        deposit: deposit,
        challengePeriod: challengePeriod,
      })

      await checkBalanceAfterGas(txn, oldBalance)

      await channelStateAsserts({
        instance: channelManager,
        agentA: ACCT_0.address,
        agentB: ACCT_1.address,
        expectedDeposit0: deposit,
        expectedBalance0: deposit,  
        channelStatus: CHANNEL_STATUS.OPEN,
        challengePeriod: challengePeriod 
      })

      await revertSnapshot(snapshot)
    })
  })

  context('closeChannel', async () => {
  })

  context('challenge', async () => {
  })

})
