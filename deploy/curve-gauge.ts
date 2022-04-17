import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ICurveGauge__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save },
  } = hre;

  const { CURVE_GAUGE_ADDRESS } = getNetworkInfo(hre.network.config.chainId);

  if (CURVE_GAUGE_ADDRESS === undefined) {
    throw new Error('Mock deployment not implemented yet');
  } else {
    await save('CurveGauge', { abi: ICurveGauge__factory.abi, address: CURVE_GAUGE_ADDRESS });
  }
};

export default func;

func.tags = ['CurveGauge'];
