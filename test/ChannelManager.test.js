const ChannelManager = artifacts.require("./ChannelManager.sol");
const SimpleToken = artifacts.require("./SimpleToken.sol");
const ethers = require("ethers")

const {
  ACCT_0,
  ACCT_1,
  CHANNEL_STATUS
} = require("./constants.js");

const {
  createTokens,
  toBN,
  log,
  takeSnapshot,
  revertSnapshot,
  openChannel,
  checkBalanceAfterGas,
  provider,
  finalAsserts,
  sign,
} = require("./utils.js");

contract("ChannelManager", () => {

  let channelManager
  let simpleToken
  before(async () => {
    let out = await createTokens(SimpleToken)
    simpleToken = out.simpleToken
    channelManager = await ChannelManager.deployed()
  })

  it("newChannel", async () => {
    const snapshot = await takeSnapshot()
  
    let oldBalance = toBN(await provider.getBalance(ACCT_0.address))
    const ACCT_0_DEPOSIT = toBN(web3.utils.toWei('10', "ether"))
    const CHALLENGE_PERIOD = 6000;

    let txn = await openChannel({
      instance: channelManager,
      channelCreator: ACCT_0.address,
      to: ACCT_1.address,
      deposit: ACCT_0_DEPOSIT,
      challengePeriod: CHALLENGE_PERIOD,
    })

    await checkBalanceAfterGas(txn, oldBalance)

    const balance0_query = await simpleToken.balanceOf(ACCT_0.address);
    assert(balance0_query.eq(ACCT_0_CORRECT_BALANCE));


    const activeId = await channelManager.activeIds.call(
      ACCT_0.address,
      ACCT_1.address,
      simpleToken.address
    );

    const [
      acct_0_addr,
      acct_1_addr,
      tokenContract,
      deposit0,
      deposit1,
      status,
      challenge,
      nonce,
      closeTime,
      balance0,
      balance1,
      challengeStartedBy
    ] = Object.values(await channelManager.getChannel(activeId))


    assert.equal(acct_0_addr, ACCT_0.address); // address agent 0;
    assert.equal(acct_1_addr, ACCT_1.address); // address agent 1;
    assert.equal(tokenContract, simpleToken.address); // address tokenContract;
    assert(deposit0.eq(ACCT_0_DEPOSIT)); // uint depositA;
    assert.equal(deposit1.toNumber(), 0); // uint depositB;
    assert.equal(status.toNumber(), CHANNEL_STATUS.OPEN); // ChannelStatus status;
    assert.equal(challenge.toNumber(), CHALLENGE_PERIOD); // uint challenge;
    assert.equal(nonce.toNumber(), 0); // uint nonce;
    assert.equal(closeTime.toNumber(), 0); // uint closeTime;
    assert(balance0.eq(ACCT_0_DEPOSIT)); // uint balance 0; // for state update
    assert.equal(balance1.toNumber(), 0); // uint balance 1; // for state update
    assert.equal(challengeStartedBy, 0);

    await revertSnapshot(snapshot);
  });

  it.only("newChannel, no new deposit", async () => {
    const snapshot = await takeSnapshot()

    const ACCT_0_DEPOSIT = toBN(web3.utils.toWei('10', "ether"))
    const ACCT_1_DEPOSIT = toBN(web3.utils.toWei('3.1459', "ether"))
    const CHALLENGE_PERIOD = 6000;

    let oldBalance = toBN(await provider.getBalance(ACCT_0.address))
    let txn = await openChannel({
      instance: channelManager,
      channelCreator: ACCT_0.address,
      to: ACCT_1.address,
      deposit: ACCT_0_DEPOSIT,
      challengePeriod: CHALLENGE_PERIOD,
    })
    await checkBalanceAfterGas(txn, oldBalance)

    const activeId = await channelManager.activeIds.call(
      ACCT_0.address,
      ACCT_1.address,
      simpleToken.address
    );

    oldBalance = toBN(await provider.getBalance(ACCT_1.address))
    txn = await channelManager.joinChannel(activeId, ACCT_1_DEPOSIT, {
      from: ACCT_1.address,
      value: ACCT_1_DEPOSIT
    });
    await checkBalanceAfterGas(txn, oldBalance)

    await finalAsserts({
      instance: channelManager,
      agentA: ACCT_0.address,
      agentB: ACCT_1.address,
      expectedDeposit0: ACCT_0_DEPOSIT,
      expectedDeposit1: ACCT_1_DEPOSIT,
      channelStatus: CHANNEL_STATUS.JOINED,
      challengePeriod: CHALLENGE_PERIOD 
    })

    await revertSnapshot(snapshot);
  });

  it("joinChannel, deposit updated", async () => {
    const snapshot = await takeSnapshot()

    const ACCT_0_DEPOSIT = await toBN(web3.utils.toWei('10', "ether"))
    const ACCT_1_DEPOSIT = await toBN(web3.utils.toWei('3', "ether"))
    const ACCT_0_UPDATE_BALANCE = ACCT_0_DEPOSIT.sub(
      await toBN(await web3.utils.toWei('1', "ether"))
    )
    const ACCT_1_UPDATE_BALANCE = ACCT_1_DEPOSIT.add(
      await toBN(await web3.utils.toWei('1', "ether"))
    )
    const CHALLENGE_PERIOD = 6000

    let oldBalance = toBN(await provider.getBalance(ACCT_0.address))
    let txn = await openChannel({
      instance: channelManager,
      channelCreator: ACCT_0.address,
      to: ACCT_1.address,
      deposit: ACCT_0_DEPOSIT,
      challengePeriod: CHALLENGE_PERIOD,
    })
    await checkBalanceAfterGas(txn, oldBalance)

    const activeId = await channelManager.activeIds.call(
      ACCT_0.address,
      ACCT_1.address,
      0 
    )

    oldBalance = toBN(await provider.getBalance(ACCT_1.address))
    txn = await channelManager.joinChannel(activeId, ACCT_1_DEPOSIT, {
      from: ACCT_1.address,
      value: ACCT_1_DEPOSIT
    })
    await checkBalanceAfterGas(txn, oldBalance)
    
    let updateNonce = 1
    let fingerprint = await web3.utils.soliditySha3(
      activeId,
      updateNonce,
      ACCT_0_UPDATE_BALANCE,
      ACCT_1_UPDATE_BALANCE,
    )

    let sig0 = await sign(ACCT_0, fingerprint)
    let sig1 = await sign(ACCT_1, fingerprint)
    assert(await channelManager.isValidStateUpdate(
      activeId,
      updateNonce, // update with higher nonce
      ACCT_0_UPDATE_BALANCE,
      ACCT_1_UPDATE_BALANCE,
      sig0,
      sig1,
      true,
      true,
      {
        from: ACCT_1.address,
      }
    ))

    await channelManager.updateState(
      activeId,
      updateNonce, // update with higher nonce
      ACCT_0_UPDATE_BALANCE.toString(),
      ACCT_1_UPDATE_BALANCE.toString(),
      sig0,
      sig1,
      { from: ACCT_0.address }
    );
    await finalAsserts({
      instance: channelManager,
      agentA: ACCT_0.address,
      agentB: ACCT_1.address,
      channelNonce: updateNonce,
      expectedDeposit0: ACCT_0_DEPOSIT,
      expectedBalance0: ACCT_0_UPDATE_BALANCE,  
      expectedDeposit1: ACCT_1_DEPOSIT,
      expectedBalance1: ACCT_1_UPDATE_BALANCE,  
      channelStatus: CHANNEL_STATUS.JOINED,
      challengePeriod: CHALLENGE_PERIOD 
    })

    await revertSnapshot(snapshot);
  });

  it("newChannel, eth opened but not joined", async () => {
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

    await finalAsserts({
      instance: channelManager,
      agentA: ACCT_0.address,
      agentB: ACCT_1.address,
      expectedDeposit0: deposit,
      expectedBalance0: deposit,  
      channelStatus: CHANNEL_STATUS.OPEN,
      challengePeriod: challengePeriod 
    })

    await revertSnapshot(snapshot);
  });
});
