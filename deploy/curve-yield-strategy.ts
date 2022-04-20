import { Deployments, getDeployments, getNetworkNameFromChainId, truncate } from '@ragetrade/sdk';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CurveYieldStrategy, CurveYieldStrategy__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy, fixture, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const proxyAdminDeployment = await get('ProxyAdmin');
  const curveYieldStrategyLogicDeployment = await get('CurveYieldStrategyLogic');

  const networkInfo = getNetworkInfo(hre.network.config.chainId ?? 31337);

  const clearingHouseAddress: string = networkInfo.RAGE_CLEARING_HOUSE_ADDRESS ?? (await get('ClearingHouse')).address;
  const settlementTokenAddress: string =
    networkInfo.RAGE_SETTLEMENT_TOKEN_ADDRESS ?? (await get('SettlementToken')).address;
  const ethPoolId: string = networkInfo.RAGE_ETH_POOL_ID ?? truncate((await get('ETH-vToken')).address);

  const collateralTokenDeployment = await get('CollateralToken');

  const initializeArg: CurveYieldStrategy.CurveYieldStrategyInitParamsStruct = {
    eightyTwentyRangeStrategyVaultInitParams: {
      baseVaultInitParams: {
        rageErc4626InitParams: {
          asset: (await get('CurveTriCryptoLpToken')).address,
          name: '80-20 TriCrypto Strategy',
          symbol: 'TCS',
        },
        ethPoolId,
        rageClearingHouse: clearingHouseAddress,
        rageCollateralToken: collateralTokenDeployment.address,
        rageSettlementToken: settlementTokenAddress,
      },
      closePositionSlippageSqrtToleranceBps: 0,
      resetPositionThresholdBps: 0,
      minNotionalPositionToCloseThreshold: 0,
    },
    usdc: settlementTokenAddress,
    usdt: (await get('USDT')).address,
    weth: (await get('WETH')).address,
    crvToken: (await get('USDT')).address,
    gauge: (await get('CurveGauge')).address,
    uniV3Router: networkInfo.UNISWAP_V3_ROUTER_ADDRESS,
    lpPriceHolder: networkInfo.CURVE_QUOTER,
    tricryptoPool: (await get('CurveTriCryptoPool')).address,
  };

  const proxyDeployment = await deploy('CurveYieldStrategy', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer,
    log: true,
    args: [
      curveYieldStrategyLogicDeployment.address,
      proxyAdminDeployment.address,
      CurveYieldStrategy__factory.createInterface().encodeFunctionData('initialize', [initializeArg]),
    ],
  });

  if (proxyDeployment.newlyDeployed && hre.network.config.chainId !== 31337) {
    try {
      // TODO this errors with "Cannot set property 'networks' of undefined"
      await hre.tenderly.push({
        name: 'TransparentUpgradeableProxy',
        address: proxyDeployment.address,
      });
    } catch {}
  }
};

export default func;

func.tags = ['CurveYieldStrategy'];
func.dependencies = [
  'CurveYieldStrategyLogic',
  'CollateralToken',
  'ProxyAdmin',
  'vETH',
  'WETH',
  'USDT',
  'CurveGauge',
  'CurveTriCryptoPool',
];
