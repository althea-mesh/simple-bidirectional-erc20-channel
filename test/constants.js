const {Wallet} = require('ethers')

let MNEMONIC = "cook mango twist then skin sort option civil have still rather guilt"

let path =  "m/44'/60'/0'/0/"
let ACCT_0 = new Wallet.fromMnemonic(MNEMONIC, path + 7).signingKey
let ACCT_1 = new Wallet.fromMnemonic(MNEMONIC, path + 8).signingKey
let ACCT_2 = new Wallet.fromMnemonic(MNEMONIC, path + 9).signingKey
ACCT_0.address = web3.utils.toChecksumAddress(ACCT_0.address)
ACCT_1.address = web3.utils.toChecksumAddress(ACCT_1.address)
ACCT_2.address = web3.utils.toChecksumAddress(ACCT_2.address)

module.exports = {
  ACCT_0,
  ACCT_1,
  ACCT_2,
  MNEMONIC,
  ZERO: '0x0000000000000000000000000000000000000000',
  CHANNEL_STATUS: {
    OPEN: 0,
    JOINED: 1,
    CHALLENGE: 2,
    CLOSED: 3
  }
};
