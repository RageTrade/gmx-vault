import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const logicDeployment = await deploy('CurveYieldStrategyLogic', {
    contract: 'CurveYieldStrategy',
    from: deployer,
    log: true,
  });

  if (logicDeployment.newlyDeployed && hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'CurveYieldStrategy',
      address: logicDeployment.address,
    });
  }
};

export default func;

func.tags = ['CurveYieldStrategyLogic'];
