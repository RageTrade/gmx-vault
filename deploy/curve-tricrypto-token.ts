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
      contract: 'ERC20PresetMinterPauser',
      from: deployer,
      log: true,
      args: ['Curve TriCrypto Token', '3CRYPTO'],
    });
  } else {
    await save('CurveTriCryptoLpToken', { abi: IERC20Metadata__factory.abi, address: CURVE_TRICRYPTO_LP_TOKEN });
  }
};

export default func;

func.tags = ['CurveTriCryptoLpToken'];
