import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const swapManagerLib = await get('SwapManager');

  const logicDeployment = await deploy('CurveYieldStrategyLogic', {
    contract: 'CurveYieldStrategy',
    libraries: {
      SwapManager: swapManagerLib.address,
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
      }
    });
  }
};

export default func;

func.tags = ['CurveYieldStrategyLogic'];
