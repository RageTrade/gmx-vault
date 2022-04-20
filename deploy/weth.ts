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

  const { WETH_ADDRESS } = getNetworkInfo(hre.network.config.chainId);

  if (WETH_ADDRESS === undefined) {
    // deploying mock
    await deploy('WETH', {
      contract: 'ERC20PresetMinterPauser',
      from: deployer,
      log: true,
      args: ['Wrapped Ether', 'WETH'],
    });
  } else {
    await save('WETH', { abi: IERC20Metadata__factory.abi, address: WETH_ADDRESS });
  }
};

export default func;

func.tags = ['WETH'];
