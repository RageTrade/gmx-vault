import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const logicLib = await get('LogicLibrary');
  const swapManagerLib = await get('SwapManagerLibrary');

  await deploy('CurveYieldStrategyLogic', {
    contract: 'CurveYieldStrategy',
    libraries: {
      SwapManager: swapManagerLib.address,
      Logic: logicLib.address,
    },
    from: deployer,
    log: true,
    waitConfirmations,
  });
};

export default func;

func.tags = ['CurveYieldStrategyLogic'];
func.dependencies = ['LogicLibrary', 'SwapManagerLibrary'];
