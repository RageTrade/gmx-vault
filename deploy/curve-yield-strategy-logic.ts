import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const logicLib = await get('LogicLibrary');
  const swapManagerLib = await get('SwapManagerLibrary');

  const logicDeployment = await deploy('CurveYieldStrategyLogic', {
    contract: 'CurveYieldStrategy',
    libraries: {
      SwapManager: swapManagerLib.address,
      Logic: logicLib.address,
    },
    from: deployer,
    log: true,
  });

  if (logicDeployment.newlyDeployed && hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'CurveYieldStrategy',
      address: logicDeployment.address,
      libraries: {
        SwapManager: swapManagerLib.address,
        Logic: logicLib.address,
      },
    });
  }
};

export default func;

func.tags = ['CurveYieldStrategyLogic'];
func.dependencies = ['LogicLibrary', 'SwapManagerLibrary'];
