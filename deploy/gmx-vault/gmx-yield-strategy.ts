import { truncate } from '@ragetrade/sdk';
import { parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { GMXYieldStrategy, GMXYieldStrategy__factory, ClearingHouseLens__factory } from '../../typechain-types';
import { getNetworkInfo, waitConfirmations } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy, save, execute, read },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const proxyAdminDeployment = await get('ProxyAdmin');
  const gmxYieldStrategyLogicDeployment = await get('GMXYieldStrategyLogic');

  const networkInfo = getNetworkInfo(hre.network.config.chainId ?? 31337);

  const clearingHouseAddress: string = (await get('ClearingHouse')).address;
  const settlementTokenAddress: string = (await get('SettlementToken')).address;
  const ethPoolId: string = truncate((await get('ETH-vToken')).address);

  const collateralTokenDeployment = await get('CollateralToken');

  const clearingHouseLens = ClearingHouseLens__factory.connect(
    (await get('ClearingHouseLens')).address,
    await hre.ethers.getSigner(deployer),
  );

  const initializeArg: GMXYieldStrategy.GMXYieldStrategyInitParamsStruct = {
    eightyTwentyRangeStrategyVaultInitParams: {
      baseVaultInitParams: {
        rageErc4626InitParams: {
          asset: networkInfo.SGLP_ADDRESS,
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
    rewardRouter: networkInfo.REWARD_ROUTER_ADDRESS,
  };

  const proxyDeployment = await deploy('GMXYieldStrategy', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer,
    log: true,
    args: [
      gmxYieldStrategyLogicDeployment.address,
      proxyAdminDeployment.address,
      GMXYieldStrategy__factory.createInterface().encodeFunctionData('initialize', [initializeArg]),
    ],
    estimateGasExtra: 1_000_000,
    waitConfirmations,
  });
  await save('GMXYieldStrategy', { ...proxyDeployment, abi: gmxYieldStrategyLogicDeployment.abi });
};

export default func;

func.tags = ['GMXYieldStrategy'];
func.dependencies = [
  'GMXBatchingManager',
  'GMXYieldStrategyLogic',
  'CollateralToken',
  'ProxyAdmin',
  'vETH',
  'SwapSimulator',
];
