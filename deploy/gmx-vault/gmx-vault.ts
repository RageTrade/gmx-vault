import { parseEther, parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkInfo, waitConfirmations } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  hre.tracer.enabled = true;
  const {
    deployments: { get, execute, read },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const networkInfo = getNetworkInfo(hre.network.config.chainId ?? 31337);

  const gmxBatchingManagerDeployment = await get('GMXBatchingManager');
  const gmxYieldStrategyDeployment = await get('GMXYieldStrategy');

  const MINTER_ROLE = await read('CollateralToken', 'MINTER_ROLE');
  await execute(
    'CollateralToken',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations },
    'grantRole',
    MINTER_ROLE,
    gmxYieldStrategyDeployment.address,
  );

  //
  // GlpStakingManager
  //
  await execute(
    'GlpStakingManager',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations },
    'updateGMXParams',
    1000, // _feeBps,
    parseEther('0.01'), // _wethThreshold,
    1000, // _slippageThreshold,
    gmxBatchingManagerDeployment.address,
  );

  //
  // GMXBatchingManager
  //
  await execute(
    'GMXBatchingManager',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations },
    'addVault',
    gmxYieldStrategyDeployment.address,
  );

  await execute(
    'GMXBatchingManager',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations },
    'grantAllowances',
    gmxYieldStrategyDeployment.address,
  );

  //
  // GMXYieldStrategy
  //
  await execute(
    'GMXYieldStrategy',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations },
    'grantAllowances',
  );

  await execute(
    'GMXYieldStrategy',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations },
    'updateBaseParams',
    parseUnits(networkInfo.DEPOSIT_CAP_C3CLT.toString(), 18),
    networkInfo.KEEPER_ADDRESS,
    86400, // rebalanceTimeThreshold
    500, // rebalancePriceThresholdBps
  );

  await execute(
    'GMXYieldStrategy',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations },
    'updateGMXParams',
    1000, // feeBps
    gmxBatchingManagerDeployment.address, // batchingManager
  );

  await execute(
    'GMXYieldStrategy',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations },
    'transferOwnership',
    networkInfo.MULTISIG,
  );
};

export default func;

func.tags = ['GmxVault'];
func.dependencies = ['GlpStakingManager', 'GMXBatchingManager', 'GMXYieldStrategy'];
