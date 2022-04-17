import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { IERC20Metadata__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save },
  } = hre;

  const { WETH_ADDRESS } = getNetworkInfo(hre.network.config.chainId);

  if (WETH_ADDRESS === undefined) {
    throw new Error('Mock deployment not implemented yet');
  } else {
    await save('WETH', { abi: IERC20Metadata__factory.abi, address: WETH_ADDRESS });
  }
};

export default func;

func.tags = ['WETH'];
