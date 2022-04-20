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

  const { CURVE_TOKEN_ADDRESS } = getNetworkInfo(hre.network.config.chainId);

  if (CURVE_TOKEN_ADDRESS === undefined) {
    // deploying mock
    await deploy('CurveToken', {
      contract: 'ERC20PresetMinterPauser',
      from: deployer,
      log: true,
      args: ['Curve Token', 'CRV'],
    });
  } else {
    await save('CurveToken', { abi: IERC20Metadata__factory.abi, address: CURVE_TOKEN_ADDRESS });
  }
};

export default func;

func.tags = ['CurveToken'];