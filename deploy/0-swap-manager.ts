import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const logicDeployment = await deploy('SwapManager', {
    contract: 'SwapManager',
    from: deployer,
    log: true,
  });

  if (logicDeployment.newlyDeployed && hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'SwapManager',
      address: logicDeployment.address,
    });
  }
};

export default func;

func.tags = ['SwapManager'];