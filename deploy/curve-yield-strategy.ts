import { truncate } from '@ragetrade/sdk';
import { parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CurveYieldStrategy, CurveYieldStrategy__factory, ClearingHouseLens__factory } from '../typechain-types';
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

  const clearingHouseAddress: string = (await get('ClearingHouse')).address;
  const settlementTokenAddress: string = (await get('SettlementToken')).address;
  const ethPoolId: string = truncate((await get('ETH-vToken')).address);

  const collateralTokenDeployment = await get('CollateralToken');

  const clearingHouseLens = ClearingHouseLens__factory.connect(
    (await get('ClearingHouseLens')).address,
    await hre.ethers.getSigner(deployer),
  );

  const initializeArg: CurveYieldStrategy.CurveYieldStrategyInitParamsStruct = {
    eightyTwentyRangeStrategyVaultInitParams: {
      baseVaultInitParams: {
        rageErc4626InitParams: {
          asset: (await get('CurveTriCryptoLpToken')).address,
          name: '80-20 TriCrypto Strategy',
          symbol: 'TCS',
        },
        ethPoolId,
        swapSimulator: (await get('SwapSimulator')).address,
        clearingHouseLens: clearingHouseLens.address,
        rageClearingHouse: clearingHouseAddress,
        rageCollateralToken: collateralTokenDeployment.address,
        rageSettlementToken: settlementTokenAddress,
      },
      closePositionSlippageSqrtToleranceBps: 150,
      resetPositionThresholdBps: 2000,
      minNotionalPositionToCloseThreshold: 100e6,
    },
    usdc: settlementTokenAddress,
    usdt: (await get('USDT')).address,
    weth: (await get('WETH')).address,
    crvToken: (await get('CurveToken')).address,
    gauge: (await get('CurveGauge')).address,
    uniV3Router: networkInfo.UNISWAP_V3_ROUTER_ADDRESS,
    lpPriceHolder: (await get('CurveQuoter')).address,
    tricryptoPool: (await get('CurveTriCryptoPool')).address,
  };

  const ProxyDeployment = await deploy('CurveYieldStrategy', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer,
    log: true,
    args: [
      curveYieldStrategyLogicDeployment.address,
      proxyAdminDeployment.address,
      CurveYieldStrategy__factory.createInterface().encodeFunctionData('initialize', [initializeArg]),
    ],
    gasLimit: 20_000_000,
  });
  await save('CurveYieldStrategy', { ...ProxyDeployment, abi: curveYieldStrategyLogicDeployment.abi });

  if (ProxyDeployment.newlyDeployed) {
    await execute('CurveYieldStrategy', { from: deployer, gasLimit: 20_000_000 }, 'grantAllowances');

    await execute(
      'CurveYieldStrategy',
      { from: deployer, gasLimit: 20_000_000 },
      'updateBaseParams',
      parseUnits(networkInfo.DEPOSIT_CAP_C3CLT.toString(), 18),
      networkInfo.KEEPER_ADDRESS,
      86400, // rebalanceTimeThreshold
      500, // rebalancePriceThresholdBps
    );

    const crvOracleAddress = (await get('CurveOracle')).address;
    await execute(
      'CurveYieldStrategy',
      { from: deployer, gasLimit: 20_000_000 },
      'updateCurveParams',
      1000, // feeBps
      100, // stablecoinSlippage
      parseUnits('2', 18), // crvHarvestThreshold
      500, // crvSlippageTolerance
      crvOracleAddress,
    );

    const MINTER_ROLE = await read('CollateralToken', 'MINTER_ROLE');
    await execute(
      'CollateralToken',
      { from: deployer, gasLimit: 20_000_000 },
      'grantRole',
      MINTER_ROLE,
      ProxyDeployment.address,
    );
  }
};

export default func;

func.tags = ['CurveYieldStrategy'];
func.dependencies = [
  'CurveOracle',
  'CurveQuoter',
  'CurveYieldStrategyLogic',
  'CollateralToken',
  'ProxyAdmin',
  'vETH',
  'WETH',
  'USDT',
  'CurveGauge',
  'CurveTriCryptoLpToken',
  'CurveTriCryptoPool',
  'SwapSimulator',
];
