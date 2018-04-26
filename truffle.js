require('dotenv').config()
const HDWalletProvider = require('truffle-hdwallet-provider-privkey')

module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 9545,
      network_id: '*' // Match any network id
    },
    ganache: {
      host: 'localhost',
      port: 8545,
      network_id: '*' // Match any network id
    },
    rinkeby: {
      provider: () => {
        return new HDWalletProvider(
          process.env.ETH_KEY,
          process.env.ETH_NODE_URL
        )
      },
      network_id: 4
    }
  }
}
