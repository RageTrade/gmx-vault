import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const swapManagerLib = await get('SwapManagerLibrary');

  await deploy('LogicLibrary', {
    contract: 'Logic',
    libraries: {
      SwapManager: swapManagerLib.address,
    },
    from: deployer,
    log: true,
    waitConfirmations,
  });
};

export default func;

func.tags = ['LogicLibrary'];
func.dependencies = ['SwapManagerLibrary'];
