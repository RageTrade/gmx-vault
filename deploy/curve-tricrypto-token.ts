import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { IERC20Metadata__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save },
  } = hre;

  const { TRICRYPTO_LP_TOKEN } = getNetworkInfo(hre.network.config.chainId);

  if (TRICRYPTO_LP_TOKEN === undefined) {
    throw new Error('Mock deployment not implemented yet');
  } else {
    await save('CurveTriCrypto', { abi: IERC20Metadata__factory.abi, address: TRICRYPTO_LP_TOKEN });
  }
};

export default func;

func.tags = ['CurveTriCrypto'];
