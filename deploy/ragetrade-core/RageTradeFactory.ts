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
  RageTradeFactory,
  ERC20__factory,
} from '../../typechain-types';
import { getNetworkInfo } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get, read, save, execute },
    getNamedAccounts,
  } = hre;

  const { RAGE_CLEARING_HOUSE_ADDRESS, RAGE_CLEARING_HOUSE_LENS_ADDRESS } = getNetworkInfo(hre.network.config.chainId);
  if (RAGE_CLEARING_HOUSE_ADDRESS || RAGE_CLEARING_HOUSE_LENS_ADDRESS) {
    if (RAGE_CLEARING_HOUSE_ADDRESS) {
      await save('ClearingHouse', { abi: ClearingHouse__factory.abi, address: RAGE_CLEARING_HOUSE_ADDRESS });
    }
    if (RAGE_CLEARING_HOUSE_LENS_ADDRESS) {
      await save('ClearingHouseLens', {
        abi: ClearingHouseLens__factory.abi,
        address: RAGE_CLEARING_HOUSE_LENS_ADDRESS,
      });
    }
    console.log(
      'Skipping RageTradeFactory.ts, using ClearingHouse from @ragetrade/core CH Address:',
      RAGE_CLEARING_HOUSE_ADDRESS,
    );
    return;
  }

  const { deployer } = await getNamedAccounts();
  const clearingHouseLogic = await get('ClearingHouseLogic');
  const vPoolWrapperLogic = await get('VPoolWrapperLogic');
  const insuranceFundLogic = await get('InsuranceFundLogic');
  const settlementTokenOracle = await get('SettlementTokenOracle');
  const settlementToken = await get('SettlementToken');

  await deploy('RageTradeFactory', {
    from: deployer,
    log: true,
    args: [
      clearingHouseLogic.address,
      vPoolWrapperLogic.address,
      insuranceFundLogic.address,
      settlementToken.address,
      settlementTokenOracle.address,
    ],
  });

  const vQuoteAddress = await read('RageTradeFactory', 'vQuote');
  await save('VQuote', { abi: VQuote__factory.abi, address: vQuoteAddress });
  console.log('saved "VQuote":', vQuoteAddress);

  const clearingHouseAddress = await read('RageTradeFactory', 'clearingHouse');
  await save('ClearingHouse', { abi: ClearingHouse__factory.abi, address: clearingHouseAddress });
  console.log('saved "ClearingHouse":', clearingHouseAddress);

  await deploy('ClearingHouseLens', {
    from: deployer,
    log: true,
    args: [clearingHouseAddress],
  });

  await execute(
    'ClearingHouse',
    { from: deployer, log: true },
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

  const insuranceFundAddress = await read('ClearingHouse', 'insuranceFund');
  await save('InsuranceFund', { abi: InsuranceFund__factory.abi, address: insuranceFundAddress });
  console.log('saved "InsuranceFund":', insuranceFundAddress);

  const collateralInfo = await read('ClearingHouseLens', 'getCollateralInfo', truncate(settlementToken.address));
  await save('SettlementTokenOracle', { abi: IOracle__factory.abi, address: collateralInfo.settings.oracle });
  console.log('saved "SettlementTokenOracle":', collateralInfo.settings.oracle);
};

export default func;

func.tags = ['RageTradeFactory', 'VQuote', 'ClearingHouse', 'ClearingHouseLens', 'ProxyAdmin', 'InsuranceFund'];
func.dependencies = [
  'ClearingHouseLogic',
  'VPoolWrapperLogic',
  'InsuranceFundLogic',
  'SettlementToken',
  'SettlementTokenOracle',
];
