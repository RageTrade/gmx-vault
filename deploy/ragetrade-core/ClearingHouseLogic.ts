import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkInfo } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { RAGE_CLEARING_HOUSE_ADDRESS } = getNetworkInfo(hre.network.config.chainId);
  if (RAGE_CLEARING_HOUSE_ADDRESS) {
    console.log('Skipping ClearingHouseLogic.ts, using ClearingHouse from @ragetrade/core');
    return;
  }

  const {
    deployments: { deploy, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();
  const accountLibrary = await get('AccountLibrary');

  await deploy('ClearingHouseLogic', {
    contract: 'ClearingHouse',
    from: deployer,
    log: true,
    libraries: {
      Account: accountLibrary.address,
    },
  });
};

export default func;

// Only will be deployed on hardhat network
func.skip = async hre => hre.network.config.chainId !== 31337;

func.tags = ['ClearingHouseLogic'];
func.dependencies = ['AccountLibrary'];
