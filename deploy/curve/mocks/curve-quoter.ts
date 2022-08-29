import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ILPPriceGetter__factory } from '../../../typechain-types';
import { getNetworkInfo } from '../../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save, get },
  } = hre;

  const { CURVE_QUOTER } = getNetworkInfo(hre.network.config.chainId);

  await save('CurveQuoter', {
    abi: ILPPriceGetter__factory.abi,
    address: CURVE_QUOTER ?? (await get('CurveTriCryptoPool')).address,
  });
};

export default func;

func.tags = ['CurveQuoter'];
func.dependencies = ['CurveTriCryptoPool'];
