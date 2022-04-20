import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { IERC20Metadata__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save, deploy, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { WBTC_ADDRESS } = getNetworkInfo(hre.network.config.chainId);

  if (WBTC_ADDRESS === undefined) {
    // deploying mock
    await deploy('WBTC', {
      contract: 'ERC20PresetMinterPauser',
      from: deployer,
      log: true,
      args: ['Wrapped Bitcoin', 'WBTC'],
    });
  } else {
    await save('WBTC', { abi: IERC20Metadata__factory.abi, address: WBTC_ADDRESS });
  }
};

export default func;

func.tags = ['WBTC'];
