import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { waitConfirmations } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const logicLibraryDeployment = await get('LogicLibrary');

  await deploy('GMXYieldStrategyLogic', {
    contract: 'GMXYieldStrategy',
    libraries: {
      Logic: logicLibraryDeployment.address,
    },
    from: deployer,
    log: true,
    waitConfirmations,
  });
};

export default func;

func.tags = ['GMXYieldStrategyLogic'];
func.dependencies = ['LogicLibrary'];
