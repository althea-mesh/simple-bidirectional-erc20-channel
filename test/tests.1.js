// cook mango twist then skin sort option civil have still rather guilt
/* globals artifacts, contract, web3, it, before, assert */
const BigNumber = require("bignumber.js");
const ChannelManager = artifacts.require("./ChannelManager.sol");

const abi = require("web3");

const p = require("util").promisify;
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
  createTxHashToSign,
  testSig
} = require("./utils.js");

async function foo(account, hash) {
  web3.eth.sign(account, hash, () => {});
}

contract("contract", async accounts => {
  it("newChannel, token updated", async () => {
    const hash = await testSig(true);
    const channelManager = await ChannelManager.deployed();
    const foo = p(web3.eth.sign);
    const sig0 = await foo(ACCT_0_ADDR, hash);
    console.log(sig0);
    // await channelManager.isValidBoolSig(sig0, {
    //   from: ACCT_0_ADDR
    // });
  });
});
