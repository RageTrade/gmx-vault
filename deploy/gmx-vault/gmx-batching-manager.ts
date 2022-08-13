import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { GMXBatchingManager__factory } from '../../typechain-types';
import { getNetworkInfo, waitConfirmations } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy, save, execute, read },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const proxyAdminDeployment = await get('ProxyAdmin');
  const gmxBatchingManagerLogicDeployment = await get('GMXBatchingManagerLogic');

  const networkInfo = getNetworkInfo(hre.network.config.chainId ?? 31337);

  const glpStakingManagerDeployment = await get('GlpStakingManager');

  const ProxyDeployment = await deploy('GMXBatchingManager', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer,
    log: true,
    args: [
      gmxBatchingManagerLogicDeployment.address,
      proxyAdminDeployment.address,
      GMXBatchingManager__factory.createInterface().encodeFunctionData('initialize', [
        networkInfo.SGLP_ADDRESS,
        networkInfo.REWARD_ROUTER_ADDRESS,
        networkInfo.GLP_MANAGER_ADDRESS,
        glpStakingManagerDeployment.address,
        networkInfo.KEEPER_ADDRESS,
      ]),
    ],
    estimateGasExtra: 1_000_000,
    waitConfirmations,
  });
  await save('GMXBatchingManager', { ...ProxyDeployment, abi: gmxBatchingManagerLogicDeployment.abi });
};

export default func;

func.tags = ['GMXBatchingManager'];
func.dependencies = ['ProxyAdmin', 'GMXBatchingManagerLogic', 'GlpStakingManager'];
