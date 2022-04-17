import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { IERC20Metadata__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save },
  } = hre;

  const { CRV_ADDRESS } = getNetworkInfo(hre.network.config.chainId);

  if (CRV_ADDRESS === undefined) {
    throw new Error('Mock deployment not implemented yet');
  } else {
    await save('CurveToken', { abi: IERC20Metadata__factory.abi, address: CRV_ADDRESS });
  }
};

export default func;

func.tags = ['CurveToken'];
