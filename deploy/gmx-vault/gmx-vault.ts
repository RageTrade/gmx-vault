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

  const gmxYieldStrategyDeployment = await get('GMXYieldStrategy');
  const gmxBatchingManagerDeployment = await get('GMXBatchingManager');
  const glpStakingManagerDeployment = await get('GlpStakingManager');

  //
  // provide minter role
  //

  const MINTER_ROLE = await read('CollateralToken', 'MINTER_ROLE');
  await execute(
    'CollateralToken',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
    'grantRole',
    MINTER_ROLE,
    gmxYieldStrategyDeployment.address,
  );

  //
  // update params
  //

  await execute(
    'GlpStakingManager',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
    'updateGMXParams',
    1000, // _feeBps,
    parseEther('0.01'), // _wethThreshold,
    1000, // _slippageThreshold,
    gmxBatchingManagerDeployment.address,
  );

  await execute(
    'GMXYieldStrategy',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
    'updateBaseParams',
    parseUnits(networkInfo.DEPOSIT_CAP_C3CLT.toString(), 18),
    networkInfo.KEEPER_ADDRESS,
    86400, // rebalanceTimeThreshold
    500, // rebalancePriceThresholdBps
  );

  await execute(
    'GMXYieldStrategy',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
    'updateGMXParams',
    glpStakingManagerDeployment.address,
    1000, // _usdcReedemSlippage
    1e6, // _usdcConversionThreshold
  );

  await execute(
    'GMXBatchingManager',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
    'addVault',
    gmxYieldStrategyDeployment.address,
  );

  await execute(
    'GlpStakingManager',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
    'setVault',
    gmxYieldStrategyDeployment.address,
    true,
  );

  //
  // grant allowances
  //

  await execute(
    'GMXBatchingManager',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
    'grantAllowances',
    gmxYieldStrategyDeployment.address,
  );

  await execute(
    'GMXYieldStrategy',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
    'grantAllowances',
  );

  //
  // finally transfer ownership
  //

  await execute(
    'GMXYieldStrategy',
    { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
    'transferOwnership',
    networkInfo.MULTISIG,
  );
};

export default func;

func.tags = ['GmxVault'];
func.dependencies = ['GlpStakingManager', 'GMXBatchingManager', 'GMXYieldStrategy'];
