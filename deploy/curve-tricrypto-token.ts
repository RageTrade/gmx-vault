import { parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { IERC20Metadata__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save, deploy },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { CURVE_TRICRYPTO_LP_TOKEN } = getNetworkInfo(hre.network.config.chainId);

  if (CURVE_TRICRYPTO_LP_TOKEN === undefined) {
    // deploying mock
    await deploy('CurveTriCryptoLpToken', {
      contract: 'TokenMock',
      from: deployer,
      log: true,
      args: ['Curve TriCrypto Token', '3CRYPTO', 18, parseUnits('1000000000', 18)],
    });
  } else {
    await save('CurveTriCryptoLpToken', { abi: IERC20Metadata__factory.abi, address: CURVE_TRICRYPTO_LP_TOKEN });
  }
};

export default func;

func.tags = ['CurveTriCryptoLpToken'];
