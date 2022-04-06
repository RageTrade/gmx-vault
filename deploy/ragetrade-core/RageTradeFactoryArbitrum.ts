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
} from '../../typechain-types';
import { IClearingHouseStructures } from '../../typechain-types/artifacts/@ragetrade/core/contracts/protocol/clearinghouse/ClearingHouse';
import addresses from '../../test/fixtures/addresses';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get, read, save, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();
  const clearingHouseLogic = await get('ClearingHouseLogic');
  const vPoolWrapperLogic = await get('VPoolWrapperLogic');
  const insuranceFundLogic = await get('InsuranceFundLogic');

  const deployment = await deploy('RageTradeFactoryArbitrum', {
    contract: 'RageTradeFactory',
    from: deployer,
    log: true,
    args: [clearingHouseLogic.address, vPoolWrapperLogic.address, insuranceFundLogic.address, addresses.USDC],
  });

  if (deployment.newlyDeployed && hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'RageTradeFactory',
      address: deployment.address,
    });
  }

  const vQuoteAddress = await read('RageTradeFactoryArbitrum', 'vQuote');
  await save('VQuoteArbitrum', { abi: VQuote__factory.abi, address: vQuoteAddress });
  console.log('saved "VQuoteArbitrum":', vQuoteAddress);
  if (hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'VQuote',
      address: vQuoteAddress,
    });
  }

  const clearingHouseAddress = await read('RageTradeFactoryArbitrum', 'clearingHouse');
  await save('ClearingHouseArbitrum', { abi: ClearingHouse__factory.abi, address: clearingHouseAddress });
  console.log('saved "ClearingHouseArbitrum":', clearingHouseAddress);
  if (hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'TransparentUpgradeableProxy',
      address: clearingHouseAddress,
    });
  }

  execute(
    'ClearingHouseArbitrum',
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

  const proxyAdminAddress = await read('RageTradeFactoryArbitrum', 'proxyAdmin');
  await save('ProxyAdminArbitrum', { abi: ProxyAdmin__factory.abi, address: proxyAdminAddress });
  console.log('saved "ProxyAdminArbitrum":', proxyAdminAddress);
  if (hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'ProxyAdmin',
      address: proxyAdminAddress,
    });
  }

  const insuranceFundAddress = await read('ClearingHouseArbitrum', 'insuranceFund');
  await save('InsuranceFundArbitrum', { abi: InsuranceFund__factory.abi, address: insuranceFundAddress });
  console.log('saved "InsuranceFundArbitrum":', insuranceFundAddress);
  if (hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'TransparentUpgradeableProxy',
      address: insuranceFundAddress,
    });
  }
  const collateralInfo: IClearingHouseStructures.CollateralStruct = await read(
    'ClearingHouseArbitrum',
    'getCollateralInfo',
    truncate(addresses.USDC),
  );
  await save('SettlementTokenOracleArbitrum', { abi: IOracle__factory.abi, address: collateralInfo.settings.oracle });
  console.log('saved "SettlementTokenOracleArbitrum":', collateralInfo.settings.oracle);
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

func.tags = ['RageTradeFactoryArbitrum'];
func.dependencies = ['ClearingHouseLogic', 'VPoolWrapperLogic', 'InsuranceFundLogic', 'SettlementToken'];
