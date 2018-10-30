const p = require("util").promisify;
const toBN = web3.utils.toBN
const ethers = require("ethers")
const { joinSignature } = require("ethers").utils
const SimpleToken = artifacts.require("./SimpleToken.sol")

let provider = new ethers.providers.Web3Provider(web3.currentProvider)

const {
  ACCT_0,
  ACCT_1,
  ZERO,
} = require("./constants.js");


module.exports = {
  sleep,
  filterLogs,
  mineBlocks,
  createTokens,
  takeSnapshot,
  revertSnapshot,
  log,
  toBN,
  openChannel,
  channelStateAsserts,
  checkBalanceAfterGas,
  joinChannel,
  updateChannel,
  challengeChannel,
  closeChannel,
  openJoin,
  openJoinChallenge,
  provider,
  sign,
};

function log (...args) {console.log(...args)}

let snapshotInc = 0;

async function takeSnapshot() {
  const {error, result} = await p(web3.currentProvider.send)({
    jsonrpc: "2.0",
    method: "evm_snapshot",
    id: snapshotInc++
  })
  return result
}

async function revertSnapshot(snapshotId) {
  await p(web3.currentProvider.send)({
    jsonrpc: "2.0",
    method: "evm_revert",
    params: [snapshotId],
    id: snapshotInc++
  })
}

function sleep(time) {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  })
}

async function mineBlock() {
  await p(web3.currentProvider.sendAsync.bind(web3.currentProvider))({
    jsonrpc: "2.0",
    method: "evm_mine",
    id: new Date().getTime()
  });
}

async function mineBlocks(count) {
  let i = 0;
  while (i < count) {
    await mineBlock();
    i++;
  }
}

function filterLogs(logs) {
  return logs.map(log => [log.event, log.args]);
}

async function createTokens(SimpleToken) {
  const SIMPLE_TOKEN_SUPPLY = await web3.utils.toWei('10000', "ether")
  const AMOUNT_TO_EACH = (await toBN(SIMPLE_TOKEN_SUPPLY)).div(await toBN(2))
  const simpleToken = await SimpleToken.new({ from: ACCT_0.address })
  await simpleToken.transfer(ACCT_1.address, AMOUNT_TO_EACH, {
    from: ACCT_0.address
  })

  assert((await simpleToken.balanceOf(ACCT_0.address)).eq(AMOUNT_TO_EACH))
  assert((await simpleToken.balanceOf(ACCT_1.address)).eq(AMOUNT_TO_EACH))

  return {simpleToken, SIMPLE_TOKEN_SUPPLY, AMOUNT_TO_EACH}
}

async function sign (signer, message) {
  return joinSignature(signer.signDigest(message))

}


async function checkBalanceAfterGas(txn, oldBalance) {
  let txnCost = toBN(
    (await provider.getGasPrice())*txn.receipt.gasUsed
  )
  let { value, from } = await provider.getTransaction(txn.tx)

  assert(
    oldBalance.sub(toBN(value)).sub(txnCost)
    .eq(toBN(await provider.getBalance(from))),
    "Ether balance after gas does not math"
  )
}

async function channelStateAsserts({
  instance,
  channelStatus,
  channelCreator = ACCT_0.address,
  counterParty = ACCT_1.address,
  tokenAddr = ZERO,
  challengePeriod = 0,
  channelNonce = 0,
  expectedCloseTime = toBN('0'),
  expectedDeposit0 = toBN('0'),
  expectedDeposit1 = toBN('0'),
  expectedBalance0 = toBN('0'),
  expectedBalance1 = toBN('0'),
  expectedChallenger  = ZERO,
}) {

  const activeId = await instance.activeIds.call(
    channelCreator,
    counterParty,
    tokenAddr
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
  ] = Object.values(await instance.getChannel(activeId))

  assert.equal(acct_0_addr, channelCreator, "AgentA not equal")
  assert.equal(acct_1_addr, counterParty, "AgentB not equal")
  assert.equal(tokenContract, tokenAddr, "Token address not equal")
  assert(deposit0.eq(expectedDeposit0), "Expected deposit0 not equal")
  assert(deposit1.eq(expectedDeposit1), "Expected deposit1 not equal" )
  assert(balance0.eq(expectedBalance0), "Expected balance0 not equal")
  assert(balance1.eq(expectedBalance1), "Expected balance1 not equal")
  assert.equal(status.toNumber(), channelStatus, "Channel status not equal")
  assert.equal(
    challenge.toNumber(),
    challengePeriod,
    "Challenge period not equal"
  )
  assert.equal(nonce.toNumber(), channelNonce, "Nonce not equal")
  assert(closeTime.eq(expectedCloseTime), "Close time not equal")
  assert.equal(expectedChallenger, challengeStartedBy, "Challenger not equal")
}

// contract functions
async function openChannel({
  instance,
  deposit,
  challengePeriod,
  channelCreator = ACCT_0.address,
  counterParty = ACCT_1.address,
  tokenAddr = ZERO,
}) {

  let txn = await instance.openChannel(
    counterParty,
    tokenAddr,
    deposit,
    challengePeriod,
    { from: channelCreator, value: deposit }
  )
  return txn
}


async function joinChannel({
  instance,
  deposit,
  channelCreator = ACCT_0.address,
  counterParty = ACCT_1.address,
  tokenAddr = ZERO
}) {

  const activeId = await instance.activeIds.call(
    channelCreator,
    counterParty,
    tokenAddr
  );
  
  let oldBalance = toBN(await provider.getBalance(counterParty))
  let txn = await instance.joinChannel(activeId, ZERO, {
    from: counterParty,
    value: deposit,
  });
  await checkBalanceAfterGas(txn, oldBalance)
}

async function updateChannel({
  instance,
  updateNonce,
  balance0,
  balance1,
  channelCreator = ACCT_0.address,
  counterParty = ACCT_1.address,
  signer0 = null,
  signer1 = null,
}) {

  const activeId = await instance.activeIds.call(
    channelCreator,
    counterParty,
    ZERO
  )

  let fingerprint = web3.utils.soliditySha3(
    activeId,
    updateNonce,
    balance0,
    balance1,
  )

  let signerA = channelCreator === ACCT_0.address ? ACCT_0 : signer0
  let signerB = counterParty === ACCT_1.address ? ACCT_1 : signer1
  let sig0 = await sign(signerA, fingerprint)
  let sig1 = await sign(signerB, fingerprint)

  assert(await instance.isValidStateUpdate(
    activeId,
    updateNonce,
    balance0,
    balance1,
    sig0,
    sig1,
    true,
    true,
    { from: ACCT_1.address }
  ), "Channel update is not valid")

  await instance.updateState(
    activeId,
    updateNonce,
    balance0,
    balance1,
    sig0,
    sig1
  )
}

async function challengeChannel({
  instance,
  channelCreator = ACCT_0.address,
  counterParty = ACCT_1.address,
  challenger = null,
  tokenAddr = ZERO,
}) {
  if (!challenger) { challenger = channelCreator}
  const activeId = await instance.activeIds.call(
    channelCreator,
    counterParty,
    tokenAddr
  )
  // we return this one because it contains the logs
  // with some useful information
  return instance.startChallenge(activeId, {from: challenger })
}

async function closeChannel({
  instance,
  channelCreator = ACCT_0.address,
  counterParty = ACCT_1.address,
  tokenAddr = ZERO,
}) {
  const activeId = await instance.activeIds.call(
    channelCreator,
    counterParty,
    tokenAddr
  )
  await instance.closeChannel(activeId)
}

async function openJoin({
  instance,
  channelCreator = ACCT_0.address,
  counterParty = ACCT_1.address,
  challengePeriod = 0,
  deposit0 = toBN('0'),
  deposit1 = toBN('0'),
}) {

  let oldBalance = toBN(await provider.getBalance(ACCT_0.address))
  let txn = await openChannel({
    instance,
    channelCreator,
    counterParty,
    deposit: deposit0,
    challengePeriod,
  })
  await checkBalanceAfterGas(txn, oldBalance)
  await joinChannel({
    instance,
    channelCreator,
    challengePeriod,
    deposit: deposit1,
  })
}

async function openJoinChallenge({
  instance,
  channelCreator = ACCT_0.address,
  counterParty = ACCT_1.address,
  challengePeriod = 0,
  deposit0 = toBN('0'),
  deposit1 = toBN('0'),
}) {

  await openJoin({
    instance,
    channelCreator,
    counterParty,
    deposit0,
    deposit1,
    challengePeriod,
  })

  // we return this one because it contains the logs
  // with some useful information
  return await challengeChannel({instance})
}
