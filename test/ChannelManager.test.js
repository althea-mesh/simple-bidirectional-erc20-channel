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
} = require("./utils.js");

contract("ChannelManager", () => {

  let channelManager
  let simpleToken, AMOUNT_TO_EACH
  before(async () => {
    let out = await createTokens(SimpleToken)
    simpleToken = out.simpleToken
    AMOUNT_TO_EACH = out.AMOUNT_TO_EACH
    channelManager = await ChannelManager.deployed()
  })

  it("newChannel, token opened", async () => {
    const snapshot = await takeSnapshot()

    const ACCT_0_DEPOSIT = toBN(web3.utils.toWei('10', "ether"))
    const ACCT_0_CORRECT_BALANCE = AMOUNT_TO_EACH.sub(ACCT_0_DEPOSIT)
    const CHALLENGE_PERIOD = 6000;

    await simpleToken.approve(channelManager.address, ACCT_0_DEPOSIT, {
      from: ACCT_0.address
    });

    await channelManager.openChannel(
      ACCT_1.address,
      simpleToken.address,
      ACCT_0_DEPOSIT,
      CHALLENGE_PERIOD,
      {
        from: ACCT_0.address
      }
    );

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

  it("newChannel, token joined", async () => {
    const snapshot = await takeSnapshot()

    const ACCT_0_DEPOSIT = toBN(web3.utils.toWei('10', "ether"))
    const ACCT_1_DEPOSIT = toBN(web3.utils.toWei('3.1459', "ether"))
    const ACCT_0_CORRECT_BALANCE = AMOUNT_TO_EACH.sub(ACCT_0_DEPOSIT)
    const ACCT_1_CORRECT_BALANCE = AMOUNT_TO_EACH.sub(ACCT_1_DEPOSIT)

    const CHALLENGE_PERIOD = 6000;

    await simpleToken.approve(channelManager.address, ACCT_0_DEPOSIT, {
      from: ACCT_0.address
    });

    await channelManager.openChannel(
      ACCT_1.address,
      simpleToken.address,
      ACCT_0_DEPOSIT,
      CHALLENGE_PERIOD,
      {
        from: ACCT_0.address
      }
    );

    const balance0_query = await simpleToken.balanceOf(ACCT_0.address);
    assert(balance0_query.eq(ACCT_0_CORRECT_BALANCE))

    const activeId = await channelManager.activeIds.call(
      ACCT_0.address,
      ACCT_1.address,
      simpleToken.address
    );

    await simpleToken.approve(channelManager.address, ACCT_1_DEPOSIT, {
      from: ACCT_1.address
    });
    await channelManager.joinChannel(activeId, ACCT_1_DEPOSIT, {
      from: ACCT_1.address
    });

    const balance1_query = await simpleToken.balanceOf(ACCT_1.address);
    assert(balance1_query.eq(ACCT_1_CORRECT_BALANCE))

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
    assert(deposit1.eq(ACCT_1_DEPOSIT)); // uint depositB;
    assert.equal(status.toNumber(), CHANNEL_STATUS.JOINED); // ChannelStatus status;
    assert.equal(challenge.toNumber(), CHALLENGE_PERIOD); // uint challenge;
    assert.equal(nonce.toNumber(), 0); // uint nonce;
    assert.equal(closeTime.toNumber(), 0); // uint closeTime;
    assert(balance0.eq(ACCT_0_DEPOSIT)); // uint balance 0; // for state update
    assert(balance1.eq(ACCT_1_DEPOSIT)); // uint balance 1; // for state update
    assert.equal(challengeStartedBy, 0);

    await revertSnapshot(snapshot);
  });

  it.only("newChannel, token updated", async () => {
    const snapshot = await takeSnapshot()

    const ACCT_0_DEPOSIT = await toBN(web3.utils.toWei('10', "ether"))
    const ACCT_1_DEPOSIT = await toBN(web3.utils.toWei('3', "ether"))
    const ACCT_0_CORRECT_BALANCE = AMOUNT_TO_EACH.sub(ACCT_0_DEPOSIT)
    const ACCT_1_CORRECT_BALANCE = AMOUNT_TO_EACH.sub(ACCT_1_DEPOSIT)
    const ACCT_0_UPDATE_BALANCE = ACCT_0_DEPOSIT.sub(
      await toBN(await web3.utils.toWei('1', "ether"))
    )
    const ACCT_1_UPDATE_BALANCE = ACCT_1_DEPOSIT.add(
      await toBN(await web3.utils.toWei('1', "ether"))
    )
    const CHALLENGE_PERIOD = 6000

    await simpleToken.approve(channelManager.address, ACCT_0_DEPOSIT, {
      from: ACCT_0.address
    })

    await channelManager.openChannel(
      ACCT_1.address,
      simpleToken.address,
      ACCT_0_DEPOSIT,
      CHALLENGE_PERIOD,
      { from: ACCT_0.address }
    )

    assert(
      (await simpleToken.balanceOf(ACCT_0.address)).eq(ACCT_0_CORRECT_BALANCE)
    )

    const activeId = await channelManager.activeIds.call(
      ACCT_0.address,
      ACCT_1.address,
      simpleToken.address
    )

    await simpleToken.approve(channelManager.address, ACCT_1_DEPOSIT, {
      from: ACCT_1.address
    })
    await channelManager.joinChannel(activeId, ACCT_1_DEPOSIT, {
      from: ACCT_1.address
    })
    
    assert(
      (await simpleToken.balanceOf(ACCT_1.address)).eq(ACCT_1_CORRECT_BALANCE)
    )

    let updateNonce = 1
    let fingerprint = web3.utils.soliditySha3(
      activeId,
      updateNonce,
      ACCT_0_UPDATE_BALANCE,
      ACCT_1_UPDATE_BALANCE,
    )

    let sig0 = ethers.utils.joinSignature(ACCT_0.signDigest(fingerprint))
    let sig1 = ethers.utils.joinSignature(ACCT_1.signDigest(fingerprint))

    const is_valid = await channelManager.isValidStateUpdate(
      activeId,
      updateNonce, // update with higher nonce
      ACCT_0_UPDATE_BALANCE,
      ACCT_1_UPDATE_BALANCE,
      sig0,
      sig1,
      true,
      true,
      { from: ACCT_0.address }
    )

    assert(is_valid)

    await channelManager.updateState(
      activeId,
      updateNonce, // update with higher nonce
      ACCT_0_UPDATE_BALANCE.toString(),
      ACCT_1_UPDATE_BALANCE.toString(),
      sig0,
      sig1,
      { from: ACCT_0.address }
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
    ] = Object.values(await channelManager.getChannel(activeId));

    assert.equal(acct_0_addr, ACCT_0.address); // address agent 0
    assert.equal(acct_1_addr, ACCT_1.address); // address agent 1
    assert.equal(tokenContract, simpleToken.address); // address tokenContract
    // Using .eq here because both values are BN.js.
    assert(deposit0.eq(ACCT_0_DEPOSIT)); // uint depositA
    assert(deposit1.eq(ACCT_1_DEPOSIT)); // uint depositB

    assert.equal(status.toNumber(), CHANNEL_STATUS.JOINED); // ChannelStatus status

    assert.equal(challenge.toNumber(), CHALLENGE_PERIOD); // uint challenge
    assert.equal(nonce.toNumber(), updateNonce); // uint nonce;
    assert.equal(closeTime.toNumber(), 0); // uint closeTime;
    assert(balance0.eq(ACCT_0_UPDATE_BALANCE)); // uint balance 0
    assert(balance1.eq(ACCT_1_UPDATE_BALANCE)); // uint balance 1
    assert.equal(challengeStartedBy, 0);

    await revertSnapshot(snapshot);
  });

  it("newChannel, eth opened but not joined", async () => {
    const snapshot = await takeSnapshot()

    // for some reason we have an initial balance, so lets just use that
    const ACCT_0_BALANCE = toBN(await web3.eth.getBalance(ACCT_0.address));
    const ACCT_1_BALANCE = toBN(await web3.eth.getBalance(ACCT_1.address));
    const ACCT_0_DEPOSIT = toBN(web3.utils.toWei('5', "ether"));
    const ACCT_0_CORRECT_BALANCE = ACCT_0_BALANCE.sub(ACCT_0_DEPOSIT);
    const CHALLENGE_PERIOD = 6000;

    let txn = await channelManager.openChannel(
      ACCT_1.address,
      0,
      ACCT_0_DEPOSIT,
      CHALLENGE_PERIOD,
      {
        from: ACCT_0.address,
        value: ACCT_0_DEPOSIT
      }
    );

    let txnCost = toBN((await web3.eth.getGasPrice())*txn.receipt.gasUsed)
    const new_address_balance_0 = toBN(await web3.eth.getBalance(ACCT_0.address));
    assert(new_address_balance_0.eq(ACCT_0_CORRECT_BALANCE.sub(txnCost)));

    const activeId = await channelManager.activeIds.call(
      ACCT_0.address,
      ACCT_1.address,
      0
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
    ] = Object.values(await channelManager.getChannel(activeId));


    assert.equal(acct_0_addr, ACCT_0.address); // address agent 0;
    assert.equal(acct_1_addr, ACCT_1.address); // address agent 1;
    assert.equal(tokenContract, 0); // address tokenContract;
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
});
