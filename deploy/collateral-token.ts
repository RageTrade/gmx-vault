import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const deployment = await deploy('CollateralToken', {
    contract: 'ERC20PresetMinterPauser',
    from: deployer,
    log: true,
    args: ['RageTradeVaultsCollateralToken', 'RTVC'],
  });

  if (deployment.newlyDeployed && hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'ERC20PresetMinterPauser',
      address: deployment.address,
    });
  }
};

export default func;

func.tags = ['CollateralToken'];
