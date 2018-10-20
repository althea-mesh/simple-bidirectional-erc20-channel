// cook mango twist then skin sort option civil have still rather guilt
/* globals artifacts, contract, web3, it, before, assert */
const p = require("util").promisify;

const ChannelManager = artifacts.require("./ChannelManager.sol");
const SimpleToken = artifacts.require("./SimpleToken.sol");

const {
  ACCT_0_PRIVKEY,
  ACCT_0_ADDR,
  ACCT_1_PRIVKEY,
  ACCT_1_ADDR,
  ACCT_2_PRIVKEY,
  ACCT_2_ADDR,
  CHANNEL_STATUS
} = require("./constants.js");

const {
  takeSnapshot,
  revertSnapshot,
  createTokens,
  createTxHashToSign
} = require("./utils.js");

contract("ChannelManager", async accounts => {
  it("newChannel, token opened", async () => {
    const snapshot = await takeSnapshot();
    const [
      simpleToken,
      SIMPLE_TOKEN_SUPPLY,
      AMOUNT_TO_EACH
    ] = await createTokens(SimpleToken);
    const ACCT_0_DEPOSIT = web3.utils.toWei('10', "ether");
    const ACCT_0_CORRECT_BALACE = AMOUNT_TO_EACH.toNumber() - ACCT_0_DEPOSIT;
    const CHALLENGE_PERIOD = 6000;

    const channelManager = await ChannelManager.deployed();
    await simpleToken.approve(channelManager.address, ACCT_0_DEPOSIT, {
      from: ACCT_0_ADDR
    });

    await channelManager.openChannel(
      ACCT_1_ADDR,
      simpleToken.address,
      ACCT_0_DEPOSIT,
      CHALLENGE_PERIOD,
      {
        from: ACCT_0_ADDR
      }
    );

    const balance0_query = await simpleToken.balanceOf(ACCT_0_ADDR);
    assert.equal(balance0_query.toNumber(), ACCT_0_CORRECT_BALACE);

    const activeId = await channelManager.activeIds.call(
      ACCT_0_ADDR,
      ACCT_1_ADDR,
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
    ] = await channelManager.getChannel(activeId);

    assert.equal(acct_0_addr, ACCT_0_ADDR); // address agent 0;
    assert.equal(acct_1_addr, ACCT_1_ADDR); // address agent 1;
    assert.equal(tokenContract, simpleToken.address); // address tokenContract;
    assert.equal(deposit0, ACCT_0_DEPOSIT); // uint depositA;
    assert.equal(deposit1, 0); // uint depositB;
    assert.equal(status, CHANNEL_STATUS.OPEN); // ChannelStatus status;
    assert.equal(challenge, CHALLENGE_PERIOD); // uint challenge;
    assert.equal(nonce, 0); // uint nonce;
    assert.equal(closeTime, 0); // uint closeTime;
    assert.equal(balance0, ACCT_0_DEPOSIT); // uint balance 0; // for state update
    assert.equal(balance1, 0); // uint balance 1; // for state update
    assert.equal(challengeStartedBy, 0);

    await revertSnapshot(snapshot);
  });

  it("newChannel, token joined", async () => {
    const snapshot = await takeSnapshot();
    const [
      simpleToken,
      SIMPLE_TOKEN_SUPPLY,
      AMOUNT_TO_EACH
    ] = await createTokens(SimpleToken);
    const ACCT_0_DEPOSIT = web3.utils.toWei('10', "ether");
    const ACCT_1_DEPOSIT = web3.utils.toWei('3.1459', "ether");
    const ACCT_0_CORRECT_BALACE = AMOUNT_TO_EACH.toNumber() - ACCT_0_DEPOSIT;
    const ACCT_1_CORRECT_BALACE = AMOUNT_TO_EACH.toNumber() - ACCT_1_DEPOSIT;
    const CHALLENGE_PERIOD = 6000;

    const channelManager = await ChannelManager.deployed();
    await simpleToken.approve(channelManager.address, ACCT_0_DEPOSIT, {
      from: ACCT_0_ADDR
    });

    await channelManager.openChannel(
      ACCT_1_ADDR,
      simpleToken.address,
      ACCT_0_DEPOSIT,
      CHALLENGE_PERIOD,
      {
        from: ACCT_0_ADDR
      }
    );

    const balance0_query = await simpleToken.balanceOf(ACCT_0_ADDR);
    assert.equal(balance0_query.toNumber(), ACCT_0_CORRECT_BALACE);

    const activeId = await channelManager.activeIds.call(
      ACCT_0_ADDR,
      ACCT_1_ADDR,
      simpleToken.address
    );

    await simpleToken.approve(channelManager.address, ACCT_1_DEPOSIT, {
      from: ACCT_1_ADDR
    });
    await channelManager.joinChannel(activeId, ACCT_1_DEPOSIT, {
      from: ACCT_1_ADDR
    });

    const balance1_query = await simpleToken.balanceOf(ACCT_1_ADDR);
    assert.equal(balance1_query.toNumber(), ACCT_1_CORRECT_BALACE);

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
    ] = await channelManager.getChannel(activeId);

    assert.equal(acct_0_addr, ACCT_0_ADDR); // address agent 0;
    assert.equal(acct_1_addr, ACCT_1_ADDR); // address agent 1;
    assert.equal(tokenContract, simpleToken.address); // address tokenContract;
    assert.equal(deposit0, ACCT_0_DEPOSIT); // uint depositA;
    assert.equal(deposit1, ACCT_1_DEPOSIT); // uint depositB;
    assert.equal(status, CHANNEL_STATUS.JOINED); // ChannelStatus status;
    assert.equal(challenge, CHALLENGE_PERIOD); // uint challenge;
    assert.equal(nonce, 0); // uint nonce;
    assert.equal(closeTime, 0); // uint closeTime;
    assert.equal(balance0, ACCT_0_DEPOSIT); // uint balance 0; // for state update
    assert.equal(balance1, ACCT_1_DEPOSIT); // uint balance 1; // for state update
    assert.equal(challengeStartedBy, 0);

    await revertSnapshot(snapshot);
  });

  it.only("newChannel, token updated", async () => {
    const snapshot = await takeSnapshot();
    const [
      simpleToken,
      SIMPLE_TOKEN_SUPPLY,
      AMOUNT_TO_EACH
    ] = await createTokens(SimpleToken);
    const ACCT_0_DEPOSIT = web3.utils.toBN(web3.utils.toWei('10', "ether"));
    const ACCT_1_DEPOSIT = web3.utils.toBN(web3.utils.toWei('3', "ether"));
    const ACCT_0_CORRECT_BALACE = AMOUNT_TO_EACH.toNumber() - ACCT_0_DEPOSIT;
    const ACCT_1_CORRECT_BALACE = AMOUNT_TO_EACH.toNumber() - ACCT_1_DEPOSIT;
    const ACCT_0_UPDATE_BALANCE = web3.utils.toBN(ACCT_0_DEPOSIT).minus(
      web3.utils.toWei('1', "ether")
    );
    const ACCT_1_UPDATE_BALANCE = web3.utils.toBN(ACCT_1_DEPOSIT).plus(
      web3.utils.toWei('1', "ether")
    );
    const CHALLENGE_PERIOD = 6000;

    const channelManager = await ChannelManager.deployed();
    await simpleToken.approve(channelManager.address, ACCT_0_DEPOSIT, {
      from: ACCT_0_ADDR
    });

    await channelManager.openChannel(
      ACCT_1_ADDR,
      simpleToken.address,
      ACCT_0_DEPOSIT,
      CHALLENGE_PERIOD,
      {
        from: ACCT_0_ADDR
      }
    );

    const balance0_query = await simpleToken.balanceOf(ACCT_0_ADDR);
    assert.equal(balance0_query.toNumber(), ACCT_0_CORRECT_BALACE);

    const activeId = await channelManager.activeIds.call(
      ACCT_0_ADDR,
      ACCT_1_ADDR,
      simpleToken.address
    );

    await simpleToken.approve(channelManager.address, ACCT_1_DEPOSIT, {
      from: ACCT_1_ADDR
    });
    await channelManager.joinChannel(activeId, ACCT_1_DEPOSIT, {
      from: ACCT_1_ADDR
    });

    const balance1_query = await simpleToken.balanceOf(ACCT_1_ADDR);
    assert.equal(balance1_query.toNumber(), ACCT_1_CORRECT_BALACE);

    const hash = createTxHashToSign(
      activeId,
      1,
      ACCT_0_UPDATE_BALANCE.toString(),
      ACCT_1_UPDATE_BALANCE.toString()
    );

    const sig0 = web3.eth.sign(ACCT_0_ADDR, hash);
    const sig1 = web3.eth.sign(ACCT_1_ADDR, hash);

    const is_valid = await channelManager.isValidStateUpdate(
      activeId,
      1, // update with higher nonce
      ACCT_0_UPDATE_BALANCE.toString(),
      ACCT_1_UPDATE_BALANCE.toString(),
      sig0,
      sig1,
      true,
      true,
      { from: ACCT_0_ADDR }
    );
    assert.equal(is_valid, true);

    // TODO why does this fail?
    await channelManager.updateState(
      activeId,
      1, // update with higher nonce
      ACCT_0_UPDATE_BALANCE.toString(),
      ACCT_1_UPDATE_BALANCE.toString(),
      sig0,
      sig1,
      { from: ACCT_0_ADDR }
    );

    console.log(
      "testing if state update is valid",
      ACCT_0_UPDATE_BALANCE.toNumber(),
      " ",
      ACCT_1_UPDATE_BALANCE.toNumber()
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
    ] = await channelManager.getChannel(activeId);

    assert.equal(acct_0_addr, ACCT_0_ADDR); // address agent 0;
    assert.equal(acct_1_addr, ACCT_1_ADDR); // address agent 1;
    assert.equal(tokenContract, simpleToken.address); // address tokenContract;
    assert.equal(deposit0, ACCT_0_DEPOSIT); // uint depositA;
    assert.equal(deposit1, ACCT_1_DEPOSIT); // uint depositB;
    assert.equal(status, CHANNEL_STATUS.JOINED); // ChannelStatus status;
    assert.equal(challenge, CHALLENGE_PERIOD); // uint challenge;
    assert.equal(nonce, 0); // uint nonce;
    assert.equal(closeTime, 0); // uint closeTime;
    assert.equal(balance0.toNumber(), ACCT_0_UPDATE_BALANCE); // uint balance 0; // for state update
    assert.equal(balance1.toNumber(), ACCT_1_UPDATE_BALANCE); // uint balance 1; // for state update
    assert.equal(challengeStartedBy, 0);

    await revertSnapshot(snapshot);
  });

  it("newChannel, eth opened but not joined", async () => {
    const snapshot = await takeSnapshot();
    // for some reason we have an initial balance, so lets just use that
    const ACCT_0_BALANCE = web3.eth.getBalance(ACCT_0_ADDR);
    const ACCT_1_BALANCE = web3.eth.getBalance(ACCT_1_ADDR);
    const ACCT_0_DEPOSIT = web3.utils.toWei('5', "ether");
    const ACCT_0_CORRECT_BALACE = web3.utils.toBN(ACCT_0_BALANCE).minus(
      ACCT_0_DEPOSIT
    );
    const CHALLENGE_PERIOD = 6000;

    const channelManager = await ChannelManager.deployed();

    await channelManager.openChannel(
      ACCT_1_ADDR,
      0,
      ACCT_0_DEPOSIT,
      CHALLENGE_PERIOD,
      {
        from: ACCT_0_ADDR,
        value: ACCT_0_DEPOSIT
      }
    );

    const new_address_balance_0 = await web3.eth.getBalance(ACCT_0_ADDR);
    // gas making this inaccurate? any way to account for that?
    //assert.equal(new_address_balance_0, ACCT_0_CORRECT_BALACE);

    const activeId = await channelManager.activeIds.call(
      ACCT_0_ADDR,
      ACCT_1_ADDR,
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
    ] = await channelManager.getChannel(activeId);

    assert.equal(acct_0_addr, ACCT_0_ADDR); // address agent 0;
    assert.equal(acct_1_addr, ACCT_1_ADDR); // address agent 1;
    assert.equal(tokenContract, 0); // address tokenContract;
    assert.equal(deposit0.toNumber(), ACCT_0_DEPOSIT); // uint depositA;
    assert.equal(deposit1, 0); // uint depositB;
    assert.equal(status, CHANNEL_STATUS.OPEN); // ChannelStatus status;
    assert.equal(challenge, CHALLENGE_PERIOD); // uint challenge;
    assert.equal(nonce, 0); // uint nonce;
    assert.equal(closeTime, 0); // uint closeTime;
    assert.equal(balance0.toNumber(), ACCT_0_DEPOSIT); // uint balance 0; // for state update
    assert.equal(balance1, 0); // uint balance 1; // for state update
    assert.equal(challengeStartedBy, 0);

    await revertSnapshot(snapshot);
  });
});
