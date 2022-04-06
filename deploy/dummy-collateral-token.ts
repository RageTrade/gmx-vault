import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const deployment = await deploy('DummyCollateralToken', {
    contract: 'DummyCollateralToken',
    from: deployer,
    log: true,
    args: ['DummyCollateralToken', 'DCT'],
  });

  if (deployment.newlyDeployed && hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'DummyCollateralToken',
      address: deployment.address,
    });
  }
};

export default func;

func.tags = ['DummyCollateralToken'];
