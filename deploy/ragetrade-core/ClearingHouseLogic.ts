import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();
  const accountLibrary = await get('AccountLibrary');

  const deployment = await deploy('ClearingHouseLogic', {
    contract: 'ClearingHouse',
    from: deployer,
    log: true,
    libraries: {
      Account: accountLibrary.address,
    },
  });

  if (deployment.newlyDeployed && hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      contract: 'ClearingHouse',
      address: deployment.address,
      libraries: {
        Account: accountLibrary.address,
      },
    });
  }
};

export default func;

// Only will be deployed on hardhat network
func.skip = async hre => hre.network.config.chainId !== 31337;

func.tags = ['ClearingHouseLogic'];
func.dependencies = ['AccountLibrary'];
