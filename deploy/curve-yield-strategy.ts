import { Deployments, getDeployments, getNetworkNameFromChainId, truncate } from '@ragetrade/sdk';
import { ethers } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CurveYieldStrategy, CurveYieldStrategy__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy, save, execute, read },
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
    lpPriceHolder: networkInfo.CURVE_QUOTER ?? (await get('CurveTriCryptoPool')).address,
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
  await save('CurveYieldStrategy', { ...proxyDeployment, abi: curveYieldStrategyLogicDeployment.abi });

  await execute('CurveYieldStrategy', { from: deployer }, 'grantAllowances');

  await execute(
    'CurveYieldStrategy',
    { from: deployer },
    'updateDepositCap',
    parseUnits(networkInfo.DEPOSIT_CAP_C3CLT.toString(), 18),
  );

  await execute(
    'CurveTriCryptoLpToken',
    { from: deployer },
    'approve',
    proxyDeployment.address, // curveYieldStrategy
    ethers.constants.MaxUint256,
  );

  const MINTER_ROLE = await read('USDT', 'MINTER_ROLE');
  await execute('CollateralToken', { from: deployer }, 'grantRole', MINTER_ROLE, proxyDeployment.address);

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

// curveTriCryptoLpToken.approve(
//   //       curveYieldStrategy.address,
//   //       ethers.constants.MaxUint256
//   //     )

func.tags = ['CurveYieldStrategy'];
func.dependencies = [
  'CurveYieldStrategyLogic',
  'CollateralToken',
  'ProxyAdmin',
  'vETH',
  'WETH',
  'USDT',
  'CurveGauge',
  'CurveTriCryptoLpToken',
  'CurveTriCryptoPool',
];
