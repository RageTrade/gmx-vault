import { parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { truncate } from '@ragetrade/sdk';

import {
  ClearingHouse__factory,
  InsuranceFund__factory,
  IOracle__factory,
  ProxyAdmin__factory,
  VQuote__factory,
  ClearingHouseLens__factory,
  RageTradeFactory
} from '../../typechain-types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get, read, save, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();
  const clearingHouseLogic = await get('ClearingHouseLogic');
  const vPoolWrapperLogic = await get('VPoolWrapperLogic');
  const insuranceFundLogic = await get('InsuranceFundLogic');
  const settlementTokenOracle = await get('SettlementTokenOracle');
  const settlementToken = await get('SettlementToken');

  const deployment = await deploy('RageTradeFactory', {
    from: deployer,
    log: true,
    args: [
      clearingHouseLogic.address,
      vPoolWrapperLogic.address,
      insuranceFundLogic.address,
      settlementToken.address,
      settlementTokenOracle.address,
    ]
  });

  if (deployment.newlyDeployed && hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'RageTradeFactory',
      address: deployment.address,
    });
  }

  const vQuoteAddress = await read('RageTradeFactory', 'vQuote');
  await save('VQuote', { abi: VQuote__factory.abi, address: vQuoteAddress });
  console.log('saved "VQuote":', vQuoteAddress);
  if (hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'VQuote',
      address: vQuoteAddress,
    });
  }

  const clearingHouseAddress = await read('RageTradeFactory', 'clearingHouse');
  await save('ClearingHouse', { abi: ClearingHouse__factory.abi, address: clearingHouseAddress });
  console.log('saved "ClearingHouse":', clearingHouseAddress);
  if (hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'TransparentUpgradeableProxy',
      address: clearingHouseAddress,
    });
  }

  await deploy('ClearingHouseLens', {
    from: deployer,
    log: true,
    args: [clearingHouseAddress]
  });

  await execute(
    'ClearingHouse',
    { from: deployer },
    'updateProtocolSettings',
    {
      rangeLiquidationFeeFraction: 1500,
      tokenLiquidationFeeFraction: 3000,
      insuranceFundFeeShareBps: 5000,
      maxRangeLiquidationFees: 100000000,
      closeFactorMMThresholdBps: 7500,
      partialLiquidationCloseFactorBps: 5000,
      liquidationSlippageSqrtToleranceBps: 150,
      minNotionalLiquidatable: 100000000,
    },
    parseUnits('10', 6), // removeLimitOrderFee
    parseUnits('1', 6).div(100), // minimumOrderNotional
    parseUnits('20', 6), // minRequiredMargin
  );

  const proxyAdminAddress = await read('RageTradeFactory', 'proxyAdmin');
  await save('ProxyAdmin', { abi: ProxyAdmin__factory.abi, address: proxyAdminAddress });
  console.log('saved "ProxyAdmin":', proxyAdminAddress);
  if (hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'ProxyAdmin',
      address: proxyAdminAddress,
    });
  }

  const insuranceFundAddress = await read('ClearingHouse', 'insuranceFund');
  await save('InsuranceFund', { abi: InsuranceFund__factory.abi, address: insuranceFundAddress });
  console.log('saved "InsuranceFund":', insuranceFundAddress);
  if (hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'TransparentUpgradeableProxy',
      address: insuranceFundAddress,
    });
  }
  const collateralInfo = await read(
    'ClearingHouseLens',
    'getCollateralInfo',
    truncate(settlementToken.address),
  );
  await save('SettlementTokenOracle', { abi: IOracle__factory.abi, address: collateralInfo.settings.oracle });
  console.log('saved "SettlementTokenOracle":', collateralInfo.settings.oracle);
  if (hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'SettlementTokenOracle',
      address: collateralInfo.settings.oracle,
    });
  }
};

export default func;

// Only will be deployed on hardhat network
func.skip = async hre => hre.network.config.chainId !== 31337;

func.tags = ['RageTradeFactory'];
func.dependencies = [
  'ClearingHouseLogic',
  'VPoolWrapperLogic',
  'InsuranceFundLogic',
  'SettlementToken',
  'SettlementTokenOracle',
];
