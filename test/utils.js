const p = require("util").promisify;
const toBN = web3.utils.toBN
const ethers = require("ethers")
const { joinSignature } = require("ethers").utils

let provider = new ethers.providers.Web3Provider(
  web3.currentProvider
)

const {
  ACCT_A,
  ACCT_B,
  ZERO,
} = require("./constants.js");


module.exports = {
  sleep,
  filterLogs,
  mineBlocks,
  takeSnapshot,
  revertSnapshot,
  log,
  toBN,
  depositContract,
  doubleDeposit,
  channelStateAsserts,
  checkBalanceAfterGas,
  guacTransfer,
  challengeChannel,
  closeChannel,
  withdrawContract,
  openJoinChallenge,
  provider,
  sign,
};

function log (...args) {console.log(...args)}

let snapshotInc = 0;

async function takeSnapshot() {
  //eslint-disable-next-line
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

async function sign (signer, message) {
  return joinSignature(signer.signDigest(message))
}


async function checkBalanceAfterGas(txn, oldBalance, check=false) {
  if(check) {
    let txnCost = toBN(
      (await provider.getGasPrice())*txn.receipt.gasUsed
    )
    let { value, from } = await provider.getTransaction(txn.tx)

    assert(
      oldBalance.sub(toBN(value)).sub(txnCost)
      .eq(toBN(await provider.getBalance(from))),
      "Ether balance after gas does not match"
    )
  }
}

async function channelStateAsserts({
  instance,
  channelStatus = 0,
  agentA = ACCT_A.address,
  agentB = ACCT_B.address,
  channelNonce = 0,
  expectedCloseBlock = toBN('0'),
  expectedBalanceA = toBN('0'),
  expectedBalanceB = toBN('0'),
  expectedTotalBalance = toBN('0'),
}) {

  const [
    nonce,
    balanceA,
    balanceB,
    balanceTotal,
    status,
    closeBlock,
  ] = Object.values(await instance.channels.call(agentA, agentB))

  assert(expectedBalanceA.eq(balanceA), "Expected balanceA not equal")
  assert(expectedBalanceB.eq(balanceB), "Expected balanceB not equal" )
  assert(
    balanceTotal.eq(expectedTotalBalance),
    "Expected balance Total not equal"
  )
  assert.equal(status.toNumber(), channelStatus, "Channel status not equal")
  assert.equal(nonce.toNumber(), channelNonce, "Nonce not equal")
  assert(closeBlock.eq(expectedCloseBlock), "Close time not equal")
}

// contract functions
async function depositContract({
  instance,
  depositor = ACCT_A.address,
  depositAmount = toBN(0),
  agentA = ACCT_A.address,
  agentB = ACCT_B.address,
  check = false,
}) {

  let oldBalance = toBN(await provider.getBalance(agentA))
  let txn = await instance.deposit(
    agentA,
    agentB,
    { from: depositor, value: depositAmount }
  )
  //await checkBalanceAfterGas(txn, oldBalance, check)
}

async function doubleDeposit({
  instance,
  depositA,
  depositB,
}) {

  await depositContract({
    instance,
    depositAmount: depositA,
  })

  await depositContract({
    instance,
    depositor: ACCT_B.address,
    depositAmount: depositB,
  })

}

async function guacTransfer({
  instance,
  updateNonce,
  balanceA,
  balanceB,
  agentA = ACCT_A.address,
  agentB = ACCT_B.address,
  signer0 = ACCT_A,
  signer1 = ACCT_B,
}) {

  let fingerprint = web3.utils.soliditySha3(
    "Guac Transfer",
    agentA,
    agentB,
    updateNonce,
    balanceA,
    balanceB,
  )

  let sig0 = await sign(signer0, fingerprint)
  let sig1 = await sign(signer1, fingerprint)

  await instance.transfer(
    agentA,
    agentB,
    updateNonce,
    balanceA,
    balanceB,
    sig0,
    sig1,
  )
}

async function withdrawContract({
  instance,
  amount,
  withdrawer = ACCT_A.address,
  nonce = 0,
  agentA = ACCT_A.address,
  agentB = ACCT_B.address,
  signer0 = ACCT_A,
  signer1 = ACCT_B,
}) {

  let fingerprint = web3.utils.soliditySha3(
    "withdraw",
    agentA,
    agentB,
    nonce,
    amount,
    withdrawer,
  )
  let sig0 = await sign(signer0, fingerprint)
  let sig1 = await sign(signer1, fingerprint)

  return await instance.withdraw(
    agentA,
    agentB,
    nonce,
    amount,
    sig0,
    sig1,
    { from: withdrawer }
  )
}

async function challengeChannel({
  instance,
  channelCreator = ACCT_0.address,
  counterParty = ACCT_1.address,
  challenger = null,
  tokenAddr = ZERO,
}) {
  if (!challenger) { challenger = channelCreator }
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

async function doubleJoin({
  instance,
  channelCreator = ACCT_0.address,
  counterParty = ACCT_1.address,
  challengePeriod = 0,
  deposit0 = toBN('0'),
  deposit1 = toBN('0'),
}) {

  await deposit({
    instance,
    channelCreator,
    counterParty,
    deposit: deposit0,
    challengePeriod,
  })
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

