import '@nomiclabs/hardhat-waffle';
import 'hardhat-tracer';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import 'hardhat-deploy';
import 'solidity-coverage';
import '@nomiclabs/hardhat-etherscan';
import '@protodev-rage/hardhat-tenderly';
import 'hardhat-dependency-compiler';
import 'hardhat-tracer';

import { config } from 'dotenv';
import { ethers } from 'ethers';
import { task } from 'hardhat/config';

config();
const { ALCHEMY_KEY } = process.env;

if (!process.env.ALCHEMY_KEY) {
  console.warn('PLEASE NOTE: The env var ALCHEMY_KEY is not set');
}

const pk = process.env.PRIVATE_KEY || ethers.utils.hexlify(ethers.utils.randomBytes(32));

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  networks: {
    hardhat: {
      forking: {
        url: `https://arb-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`,
        blockNumber: 9323800,
      },
      blockGasLimit: 0x1fffffffffff,
      gasPrice: 0,
      initialBaseFeePerGas: 0,
      allowUnlimitedContractSize: true, // TODO: remove this
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_KEY}`,
      accounts: [pk],
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`,
      accounts: [pk],
    },
    arbmain: {
      url: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
      accounts: [pk],
    },
    arbtest: {
      url: `https://rinkeby.arbitrum.io/rpc`,
      accounts: [pk],
      chainId: 421611,
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.8.13',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          metadata: {
            // do not include the metadata hash, since this is machine dependent
            // and we want all generated code to be deterministic
            // https://docs.soliditylang.org/en/v0.8.10/metadata.html
            bytecodeHash: 'none',
          },
          outputSelection: {
            '*': {
              '*': ['storageLayout'],
            },
          },
        },
      },
    ],
  },
  dependencyCompiler: {
    paths: [
      '@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol',
      '@ragetrade/core/contracts/protocol/clearinghouse/ClearingHouse.sol',
      '@ragetrade/core/contracts/protocol/RageTradeFactory.sol',
      '@ragetrade/core/contracts/protocol/wrapper/VPoolWrapper.sol',
      '@ragetrade/core/contracts/protocol/insurancefund/InsuranceFund.sol',
      '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol',
      '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol',
      '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol',
    ],
  },
  typechain: {
    target: 'ethers-v5',
    alwaysGenerateOverloads: false,
    externalArtifacts: [
      'node_modules/@uniswap/v3-periphery/artifacts/contracts/interfaces/IQuoter.sol/IQuoter.json',
      'node_modules/@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json',
      'node_modules/@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3PoolDeployer.sol/IUniswapV3PoolDeployer.json',
      'node_modules/@uniswap/v2-core/build/IUniswapV2Factory.json',
      'node_modules/@uniswap/v2-core/build/IUniswapV2Pair.json',
      'node_modules/@uniswap/v2-periphery/build/IUniswapV2Router02.json',
    ],
  },
  etherscan: {
    // https://info.etherscan.com/api-keys/
    apiKey: process.env.ETHERSCAN_KEY,
  },
  mocha: {
    timeout: 200000,
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 100,
    enabled: !!process.env.REPORT_GAS, // REPORT_GAS=true yarn test
    coinmarketcap: process.env.COINMARKETCAP, // https://coinmarketcap.com/api/pricing/
  },
  contractSizer: {
    strict: true,
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  tenderly: {
    project: process.env.TENDERLY_PROJECT,
    username: process.env.TENDERLY_USERNAME,
  },
};
