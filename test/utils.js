const p = require("util").promisify;
const ethUtils = require("ethereumjs-util");
const toBN = web3.utils.toBN

const {
  ACCT_0_PRIVKEY,
  ACCT_0_ADDR,
  ACCT_1_PRIVKEY,
  ACCT_1_ADDR
} = require("./constants.js");

module.exports = {
  sleep,
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
      return web3.utils.padLeft(arg.toString(16), 64, 0);
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
  const SIMPLE_TOKEN_SUPPLY = await web3.utils.toWei('10000', "ether")
  const AMOUNT_TO_EACH = (await toBN(SIMPLE_TOKEN_SUPPLY)).div(await toBN(2))
  const simpleToken = await SimpleToken.new({ from: ACCT_0_ADDR })
  await simpleToken.transfer(ACCT_1_ADDR, AMOUNT_TO_EACH.toString(), {
    from: ACCT_0_ADDR
  })

  assert((await simpleToken.balanceOf(ACCT_0_ADDR)).eq(AMOUNT_TO_EACH))
  assert((await simpleToken.balanceOf(ACCT_1_ADDR)).eq(AMOUNT_TO_EACH))

  return [simpleToken, SIMPLE_TOKEN_SUPPLY, AMOUNT_TO_EACH]
}
