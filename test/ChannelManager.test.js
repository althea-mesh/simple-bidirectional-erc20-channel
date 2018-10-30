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
  updateChannel,
  openJoin,
  sign,
} = require("./utils.js")

contract("ChannelManager", () => {

  let channelManager
  before(async () => {
    channelManager = await ChannelManager.deployed()
  })

  let snapshot
  beforeEach(async () => {
    snapshot = await takeSnapshot()
  })
  afterEach(async () => {
    await revertSnapshot(snapshot)
  })

  context('newChannel', async () => {
    it("newChannel", async () => {

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

    })
  })

  context('updateState', async () => {
    it("updateState", async () => {

      const deposit0 = await toBN(web3.utils.toWei('10', "ether"))
      const deposit1 = await toBN(web3.utils.toWei('3', "ether"))
      const newBalance0 = deposit0.sub(
        await toBN(await web3.utils.toWei('1', "ether"))
      )
      const newBalance1 = deposit1.add(
        await toBN(await web3.utils.toWei('1', "ether"))
      )
      const challengePeriod= 6000

      await openJoin({
        instance: channelManager,
        challengePeriod: challengePeriod,
        deposit0: deposit0,
        deposit1: deposit1,
      })

      let updateNonce = 1 // update with higher nonce

      await updateChannel({
        instance: channelManager,
        updateNonce: updateNonce,
        balance0: newBalance0,
        balance1: newBalance1,
      })

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

    })
  })

  context('newChannel', async () => {
    it("eth opened but not joined", async () => {

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

    })
  })

  context('closeChannel', async () => {
  })

  context('challenge', async () => {
  })

})
