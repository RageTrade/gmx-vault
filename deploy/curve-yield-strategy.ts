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

  let coreDeployments: Deployments | undefined;
  try {
    const networkName = getNetworkNameFromChainId(hre.network.config.chainId ?? 31337);
    coreDeployments = await getDeployments(networkName);
  } catch {}

  let clearingHouseAddress: string;
  let settlementTokenAddress: string;
  let ethPoolId: string;
  if (coreDeployments) {
    clearingHouseAddress = coreDeployments.ClearingHouseDeployment.address;
    settlementTokenAddress = coreDeployments.SettlementTokenDeployment.address;
    ethPoolId = truncate(coreDeployments.ETH_vTokenDeployment.address);
  } else {
    const ClearingHouseDeployment = await get('ClearingHouse');
    const SettlementTokenDeployment = await get('SettlementToken');
    const ETH_vTokenDeployment = await get('ETH-vToken');
    clearingHouseAddress = ClearingHouseDeployment.address;
    settlementTokenAddress = SettlementTokenDeployment.address;
    ethPoolId = truncate(ETH_vTokenDeployment.address);
  }

  const dummyCollateralDeployment = await get('CollateralToken');

  const networkInfo = getNetworkInfo(hre.network.config.chainId ?? 31337);

  const initializeArg: CurveYieldStrategy.CurveYieldStrategyInitParamsStruct = {
    eightyTwentyRangeStrategyVaultInitParams: {
      baseVaultInitParams: {
        rageErc4626InitParams: {
          asset: dummyCollateralDeployment.address,
          name: 'TriCrypto Shares',
          symbol: 'TCS',
        },
        ethPoolId,
        rageClearingHouse: clearingHouseAddress,
        rageCollateralToken: dummyCollateralDeployment.address,
        rageSettlementToken: settlementTokenAddress,
      },
      closePositionSlippageSqrtToleranceBps: 0,
      resetPositionThresholdBps: 0,
      minNotionalPositionToCloseThreshold: 0,
    },
    usdt: networkInfo.USDT_ADDRESS,
    usdc: networkInfo.USDC_ADDRESS,
    weth: networkInfo.WETH_ADDRESS,
    crvToken: networkInfo.CRV_ADDRESS,
    gauge: networkInfo.CURVE_GAUGE_ADDRESS,
    uniV3Router: networkInfo.UNISWAP_V3_ROUTER_ADDRESS,
    lpPriceHolder: networkInfo.CURVE_QUOTER,
    tricryptoPool: networkInfo.TRICRYPTO_POOL,
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
func.dependencies = ['CurveYieldStrategyLogic', 'CollateralToken', 'ProxyAdmin', 'vETH'];
