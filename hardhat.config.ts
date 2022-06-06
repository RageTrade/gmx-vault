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

import { config } from 'dotenv';
import { ethers } from 'ethers';
import { Fragment } from 'ethers/lib/utils';
import { readJsonSync, writeJsonSync } from 'fs-extra';
import { TASK_COMPILE } from 'hardhat/builtin-tasks/task-names';
import { task } from 'hardhat/config';
import nodePath from 'path';

config();
const { ALCHEMY_KEY } = process.env;

// this compile task override is needed to copy missing abi fragments to respective artifacts (note its not aval to typechain)
task(TASK_COMPILE, 'Compiles the entire project, building all artifacts').setAction(async (taskArgs, _, runSuper) => {
  const compileSolOutput: any = await runSuper(taskArgs);

  copyEventErrorAbi(
    'artifacts/contracts/libraries/Logic.sol/Logic.json',
    'artifacts/contracts/yieldStrategy/CurveYieldStrategy.sol/CurveYieldStrategy.json',
  );
  copyEventErrorAbi(
    'artifacts/contracts/libraries/SwapManager.sol/SwapManager.json',
    'artifacts/contracts/yieldStrategy/CurveYieldStrategy.sol/CurveYieldStrategy.json',
  );

  function copyEventErrorAbi(from: string, to: string) {
    const fromArtifact = readJsonSync(nodePath.resolve(__dirname, from));
    const toArtifact = readJsonSync(nodePath.resolve(__dirname, to));
    fromArtifact.abi.forEach((fromFragment: Fragment) => {
      if (
        // only copy error and event fragments
        (fromFragment.type === 'error' || fromFragment.type === 'event') &&
        // if fragment is already in the toArtifact, don't copy it
        !toArtifact.abi.find(
          ({ name, type }: Fragment) => name + '-' + type === fromFragment.name + '-' + fromFragment.type,
        )
      ) {
        toArtifact.abi.push(fromFragment);
      }
    });

    writeJsonSync(nodePath.resolve(__dirname, to), toArtifact, { spaces: 2 });
  }

  return compileSolOutput;
});

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
      allowUnlimitedContractSize: true,
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
          // viaIR: true, 
          optimizer: {
            enabled: true,
            runs: 12
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
      '@ragetrade/core/contracts/utils/SwapSimulator.sol',
      '@ragetrade/core/contracts/oracles/ChainlinkOracle.sol',
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
      'node_modules/@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json',
      'node_modules/@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json',
      'node_modules/@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json',
      'node_modules/@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3PoolDeployer.sol/IUniswapV3PoolDeployer.json',
      'node_modules/@uniswap/v2-core/build/IUniswapV2Factory.json',
      'node_modules/@uniswap/v2-core/build/IUniswapV2Pair.json',
      'node_modules/@uniswap/v2-periphery/build/IUniswapV2Router02.json',
    ],
  },
  etherscan: {
    apiKey: {
      arbitrumTestnet: process.env.ETHERSCAN_KEY,
    },
  },
  mocha: {
    timeout: 400000,
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
