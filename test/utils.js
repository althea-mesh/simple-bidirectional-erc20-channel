const leftPad = require("left-pad");
const p = require("util").promisify;
const ethUtils = require("ethereumjs-util");
const BN = require("bn.js");
const abi = require("web3");

const {
  ACCT_0_PRIVKEY,
  ACCT_0_ADDR,
  ACCT_1_PRIVKEY,
  ACCT_1_ADDR
} = require("./constants.js");

module.exports = {
  sleep,
  takeSnapshot,
  revertSnapshot,
  solSha3,
  sign,
  ecrecover,
  filterLogs,
  mineBlocks,
  openChannel,
  updateState,
  startSettlingPeriod,
  toSolUint256,
  toSolInt256,
  closeChannel,
  createTokens,
  createTxHashToSign,
  testSig
};

function sleep(time) {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

let snapshotInc = 0;

async function takeSnapshot() {
  let res = await p(web3.currentProvider.sendAsync.bind(web3.currentProvider))({
    jsonrpc: "2.0",
    method: "evm_snapshot",
    id: snapshotInc++
  });
  return res.result;
}

async function revertSnapshot(snapshotId) {
  await p(web3.currentProvider.sendAsync.bind(web3.currentProvider))({
    jsonrpc: "2.0",
    method: "evm_revert",
    params: [snapshotId],
    id: snapshotInc++
  });
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

function toSolUint256(num) {
  return leftPad(num.toString(16), 64, 0);
}

function toSolInt256(num) {
  return new BN(num).toTwos(256).toString(16, 64);
}

function solSha3(...args) {
  args = args.map(arg => {
    if (typeof arg === "string") {
      if (arg.substring(0, 2) === "0x") {
        return arg.slice(2);
      } else {
        return web3.toHex(arg).slice(2);
      }
    }

    if (typeof arg === "number") {
      return leftPad(arg.toString(16), 64, 0);
    }
  });

  args = args.join("");

  return web3.sha3(args, { encoding: "hex" });
}

function sign(msgHash, privKey) {
  if (typeof msgHash === "string" && msgHash.slice(0, 2) === "0x") {
    msgHash = Buffer.alloc(32, msgHash.slice(2), "hex");
  }
  const sig = ethUtils.ecsign(msgHash, privKey);
  return `0x${sig.r.toString("hex")}${sig.s.toString("hex")}${sig.v.toString(
    16
  )}`;
}

function ecrecover(msg, sig) {
  const r = ethUtils.toBuffer(sig.slice(0, 66));
  const s = ethUtils.toBuffer("0x" + sig.slice(66, 130));
  const v = 27 + parseInt(sig.slice(130, 132));
  const m = ethUtils.toBuffer(msg);
  const pub = ethUtils.ecrecover(m, v, r, s);
  return "0x" + ethUtils.pubToAddress(pub).toString("hex");
}

function filterLogs(logs) {
  return logs.map(log => [log.event, log.args]);
}

async function openChannel(
  instance,
  to,
  tokenContract,
  tokenAmount,
  challenge
) {
  await instance.openChannel(to, tokenContract, tokenAmount, challenge);
}

async function updateState(
  instance,
  channelId,
  sequenceNumber,
  balance0,
  balance1,
  hashlocks
) {
  const fingerprint = solSha3(
    "updateState",
    channelId,
    sequenceNumber,
    balance0,
    balance1,
    hashlocks
  );

  const signature0 = sign(fingerprint, new Buffer(ACCT_0_PRIVKEY, "hex"));
  const signature1 = sign(fingerprint, new Buffer(ACCT_1_PRIVKEY, "hex"));

  await instance.updateState(
    channelId,
    sequenceNumber,
    balance0,
    balance1,
    hashlocks,
    signature0,
    signature1
  );
}

async function startSettlingPeriod(instance, channelId) {
  const startSettlingPeriodFingerprint = solSha3(
    "startSettlingPeriod",
    channelId
  );

  await instance.startSettlingPeriod(
    channelId,
    sign(startSettlingPeriodFingerprint, new Buffer(ACCT_0_PRIVKEY, "hex"))
  );
}

async function closeChannel(
  channelManager,
  channelId,
  hashlocks,
  balance0 = 5,
  balance1 = 7
) {
  await createChannel(channelManager, channelId, 6, 6, 2);
  await updateState(
    channelManager,
    channelId,
    1,
    balance0,
    balance1,
    hashlocks
  );
  await startSettlingPeriod(channelManager, channelId);
  await mineBlocks(5);
  await channelManager.closeChannel(channelId);
}

async function createTokens(SimpleToken) {
  const SIMPLE_TOKEN_SUPPLY = web3.toWei(10000, "ether");
  const AMOUNT_TO_EACH = web3.toBigNumber(SIMPLE_TOKEN_SUPPLY).div(2);
  const simpleToken = await SimpleToken.new({ from: ACCT_0_ADDR });
  await simpleToken.transfer(ACCT_1_ADDR, AMOUNT_TO_EACH);
  const balance0 = await simpleToken.balanceOf(ACCT_0_ADDR);
  assert.equal(balance0, AMOUNT_TO_EACH.toNumber());
  const balance1 = await simpleToken.balanceOf(ACCT_1_ADDR);
  assert.equal(balance1, AMOUNT_TO_EACH.toNumber());

  return [simpleToken, SIMPLE_TOKEN_SUPPLY, AMOUNT_TO_EACH];
}

/*   before('create tokens', async () => {
    const SIMPLE_TOKEN_SUPPLY = web3.toWei(10000, 'ether')
    const AMOUNT_TO_EACH = web3.toBigNumber(SIMPLE_TOKEN_SUPPLY).div(2)
    this.simpleToken = await SimpleToken.new({ from: AGENT_A })
    await this.simpleToken.transfer(AGENT_B, AMOUNT_TO_EACH)
    const balanceA = await this.simpleToken.balanceOf(AGENT_A)
    assert.equal(balanceA, AMOUNT_TO_EACH.toNumber())
    const balanceB = await this.simpleToken.balanceOf(AGENT_B)
    assert.equal(balanceB, AMOUNT_TO_EACH.toNumber())
  }) */

function createTxHashToSign(activeId, nonce, balanceA, balanceB) {
  // fingerprint = keccak256(channelId, nonce, balanceA, balanceB)
  let hash = abi
    .soliditySHA3(
      ["bytes32", "uint256", "uint256", "uint256"],
      [activeId, nonce, balanceA, balanceB]
    )
    .toString("hex");
  hash = `0x${hash}`;
  return hash;
}

async function testSig(boolVal) {
  // fingerprint = keccak256(channelId, nonce, balanceA, balanceB)
  let hash = await abi.utils.soliditySha3(boolVal).toString("hex");
  console.log("this is hash ", hash);
  return hash;
}
