import { truncate } from '@ragetrade/sdk';
import { parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CurveYieldStrategy, CurveYieldStrategy__factory, ClearingHouseLens__factory } from '../../typechain-types';
import { getNetworkInfo, waitConfirmations } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy, save, execute, read },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const networkInfo = getNetworkInfo(hre.network.config.chainId ?? 31337);

  const initializeArg: CurveYieldStrategy.CurveYieldStrategyInitParamsStruct = {
    eightyTwentyRangeStrategyVaultInitParams: {
      baseVaultInitParams: {
        rageErc4626InitParams: {
          asset: (await get('CurveTriCryptoLpToken')).address,
          name: '80-20 TriCrypto Strategy',
          symbol: 'TCS',
        },
        ethPoolId: truncate((await get('ETH-vToken')).address),
        swapSimulator: (await get('SwapSimulator')).address,
        clearingHouseLens: (await get('ClearingHouseLens')).address,
        rageClearingHouse: (await get('ClearingHouse')).address,
        rageCollateralToken: (await get('CollateralToken')).address,
        rageSettlementToken: (await get('SettlementToken')).address,
      },
      closePositionSlippageSqrtToleranceBps: 150,
      resetPositionThresholdBps: 2000,
      minNotionalPositionToCloseThreshold: 100e6,
    },
    usdc: (await get('SettlementToken')).address,
    usdt: (await get('USDT')).address, // networkInfo.USDT_ADDRESS,
    weth: (await get('WETH')).address, // networkInfo.WETH_ADDRESS,
    crvToken: (await get('CurveToken')).address, // networkInfo.CURVE_TOKEN_ADDRESS,
    gauge: (await get('CurveGauge')).address, // networkInfo.CURVE_GAUGE_ADDRESS,
    lpPriceHolder: (await get('CurveQuoter')).address, // networkInfo.CURVE_QUOTER,
    tricryptoPool: (await get('CurveTriCryptoPool')).address, // networkInfo.CURVE_TRICRYPTO_POOL,
    uniV3Router: networkInfo.UNISWAP_V3_ROUTER_ADDRESS,
  };

  const ProxyDeployment = await deploy('CurveYieldStrategy', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer,
    log: true,
    args: [
      (await get('CurveYieldStrategyLogic')).address,
      (await get('ProxyAdmin')).address,
      CurveYieldStrategy__factory.createInterface().encodeFunctionData('initialize', [initializeArg]),
    ],
    estimateGasExtra: 1_000_000,
    waitConfirmations,
  });
  await save('CurveYieldStrategy', { ...ProxyDeployment, abi: (await get('CurveYieldStrategyLogic')).abi });

  if (ProxyDeployment.newlyDeployed) {
    await execute(
      'CurveYieldStrategy',
      { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
      'grantAllowances',
    );

    await execute(
      'CurveYieldStrategy',
      { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
      'updateBaseParams',
      parseUnits(networkInfo.DEPOSIT_CAP_C3CLT.toString(), 18),
      networkInfo.KEEPER_ADDRESS,
      86400, // rebalanceTimeThreshold
      500, // rebalancePriceThresholdBps
    );

    await execute(
      'CurveYieldStrategy',
      { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
      'updateCurveParams',
      1000, // feeBps
      100, // stablecoinSlippage
      parseUnits('2', 18), // crvHarvestThreshold
      500, // crvSlippageTolerance
      networkInfo.CURVE_USD_ORACLE,
    );

    const MINTER_ROLE = await read('CollateralToken', 'MINTER_ROLE');
    await execute(
      'CollateralToken',
      { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
      'grantRole',
      MINTER_ROLE,
      ProxyDeployment.address,
    );

    // transfer ownership to team multisig
    await execute(
      'CurveYieldStrategy',
      { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
      'transferOwnership',
      networkInfo.MULTISIG,
    );
  }
};

export default func;

func.tags = ['CurveYieldStrategy'];
func.dependencies = [
  'CurveYieldStrategyLogic',
  'CollateralToken',
  'ProxyAdmin',
  'vETH',
  'SwapSimulator',
  'CurveTriCryptoLpToken',
  'CurveToken',
  'CurveGauge',
  'CurveQuoter',
  'CurveTriCryptoPool',
];
