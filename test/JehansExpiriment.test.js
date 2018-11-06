const JehansExperiment = artifacts.require("./JehansExperiment.sol")

const {
  ACCT_A,
  ACCT_B,
  CHANNEL_STATUS,
} = require("./constants.js")

const {
  toBN,
  log,
  takeSnapshot,
  revertSnapshot,
  depositContract,
  provider,
  doubleDeposit,
  channelStateAsserts,
  guacTransfer,
  withdrawContract,
  openJoin,
  openJoinChallenge,
  challengeChannel,
} = require("./utils.js")

contract("ChannelManager", () => {

  let instance
  before(async () => {
    instance = await JehansExperiment.deployed()
  })

  let snapshot
  beforeEach(async () => {
    snapshot = await takeSnapshot()
  })
  afterEach(async () => {
    await revertSnapshot(snapshot)
  })

  context.only('deposit', async () => {
    it("happy deposit", async () => {

      const depositAmount = toBN(web3.utils.toWei('1', "ether"))

      await depositContract({
        instance,
        depositAmount,
      })

      await channelStateAsserts({
        instance: instance,
        expectedBalanceA: depositAmount,
        expectedTotalBalance: depositAmount
      })
    })

    it.only("two accounts deposit", async () => {

      const depositA = toBN(web3.utils.toWei('1', "ether"))
      const depositB = toBN(web3.utils.toWei('2', "ether"))
      await doubleDeposit({instance, depositA, depositB})
      await channelStateAsserts({
        instance: instance,
        expectedBalanceA: depositA,
        expectedBalanceB: depositB,
        expectedTotalBalance: depositA.add(depositB)
      })
    })
  })

  context.only('updateState', async () => {
    it("happy updateState", async () => {

      const depositA = toBN(web3.utils.toWei('10', "ether"))
      const depositB = toBN(web3.utils.toWei('3.1459', "ether"))
      await doubleDeposit({instance, depositA, depositB})

      const newBalanceA = toBN(web3.utils.toWei('12', "ether"))
      const newBalanceB = toBN(web3.utils.toWei('1.1459', "ether"))
      const newNonce = 1
      await guacTransfer({
        instance,
        updateNonce: newNonce,
        balanceA: newBalanceA,
        balanceB: newBalanceB,
      })

      await channelStateAsserts({
        instance: instance,
        channelNonce: newNonce,
        expectedBalanceA: newBalanceA,
        expectedBalanceB: newBalanceB,
        expectedTotalBalance: depositA.add(depositB)
      })
    })
  })

  context('withdraw', async () => {
    it.only("happy withdraw", async () => {
      const depositA = toBN(web3.utils.toWei('1', "ether"))
      const depositB = toBN(web3.utils.toWei('3.1459', "ether"))
      await doubleDeposit({instance, depositA, depositB})

      const amountToWithdraw = toBN(web3.utils.toWei('0.5', 'ether'))
      const newNonce = 1
      const withdrawer = ACCT_A.address
      const oldBalance = toBN(await provider.getBalance(withdrawer))

      log('hi')
      let txn = await withdrawContract({
        instance,
        withdrawer,
        amount: amountToWithdraw,
        nonce: newNonce, 
      })
      let txnCost =toBN(await provider.getGasPrice()).mul(toBN(txn.receipt.gasUsed))
      log('hi')

      let cur = toBN(await provider.getBalance(withdrawer))
      log('hi')
      assert(cur.eq(oldBalance.sub(txnCost)), "Account ether balance not the same")
      log('hi')

      await channelStateAsserts({
        instance: instance,
        channelNonce: newNonce,
        expectedBalanceA: depositA.sub(amountToWithdraw),
        expectedBalanceB: depositB,
        expectedTotalBalance: depositA.add(depositB).sub(amountToWithdraw)
      })

    })
  })

  context('startChallenge', async () => {
    it('happy startChallenge', async () => {
      const deposit0 = await toBN(web3.utils.toWei('10', "ether"))
      const deposit1 = await toBN(web3.utils.toWei('3', "ether"))
      const challengePeriod= 6000

      await openJoin({
        instance,
        challengePeriod,
        deposit0,
        deposit1,
      })

      let { logs } = await challengeChannel({
        instance: instance,
      })

      await channelStateAsserts({
        instance: instance,
        expectedDeposit0: deposit0,
        expectedBalance0: deposit0,
        expectedDeposit1: deposit1,
        expectedBalance1: deposit1,
        channelStatus: CHANNEL_STATUS.CHALLENGE,
        challengePeriod: challengePeriod,
        expectedChallenger: ACCT_A.address,
        expectedCloseTime: logs[0].args.closeTime
      })
    })
  })

  context('close', async () => {
    it('happy close', async () => {
      const deposit0 = await toBN(web3.utils.toWei('10', "ether"))
      const deposit1 = await toBN(web3.utils.toWei('3', "ether"))
      const challengePeriod= 6000
      let { logs } = await openJoinChallenge({
        instance,
        challengePeriod,
        deposit0,
        deposit1,
      })
      await channelStateAsserts({
        instance: instance,
        expectedDeposit0: deposit0,
        expectedBalance0: deposit0,
        expectedDeposit1: deposit1,
        expectedBalance1: deposit1,
        channelStatus: CHANNEL_STATUS.CHALLENGE,
        challengePeriod: challengePeriod,
        expectedChallenger: ACCT_A.address,
        expectedCloseTime: logs[0].args.closeTime
      })
    })
  })
})
