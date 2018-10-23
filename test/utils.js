const p = require("util").promisify;
const toBN = web3.utils.toBN

const {
  ACCT_0_PRIVKEY,
  ACCT_0_ADDR,
  ACCT_1_PRIVKEY,
  ACCT_1_ADDR
} = require("./constants.js");

module.exports = {
  sleep,
  filterLogs,
  mineBlocks,
  createTokens,
  log,
  toBN
};


function log (...args) {console.log(...args)}

function sleep(time) {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

let snapshotInc = 0;

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

function toSolUint256(num) {
  return web3.utils.padLeft(num.toString(16), 64, 0);
}

function toSolInt256(num) {
  return new BN(num).toTwos(256).toString(16, 64);
}


function filterLogs(logs) {
  return logs.map(log => [log.event, log.args]);
}

async function createTokens(SimpleToken) {
  const SIMPLE_TOKEN_SUPPLY = await web3.utils.toWei('10000', "ether")
  const AMOUNT_TO_EACH = (await toBN(SIMPLE_TOKEN_SUPPLY)).div(await toBN(2))
  const simpleToken = await SimpleToken.new({ from: ACCT_0_ADDR })
  await simpleToken.transfer(ACCT_1_ADDR, AMOUNT_TO_EACH, {
    from: ACCT_0_ADDR
  })

  assert((await simpleToken.balanceOf(ACCT_0_ADDR)).eq(AMOUNT_TO_EACH))
  assert((await simpleToken.balanceOf(ACCT_1_ADDR)).eq(AMOUNT_TO_EACH))

  return [simpleToken, SIMPLE_TOKEN_SUPPLY, AMOUNT_TO_EACH]
}

async function testSig(boolVal) {
  // fingerprint = keccak256(channelId, nonce, balanceA, balanceB)
  let hash = await abi.utils.soliditySha3(boolVal).toString("hex");
  console.log("this is hash ", hash);
  return hash;
}
