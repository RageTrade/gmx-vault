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

  const { USDT_ADDRESS } = getNetworkInfo(hre.network.config.chainId);

  if (USDT_ADDRESS === undefined) {
    // deploying mock
    await deploy('USDT', {
      contract: 'ERC20PresetMinterPauser',
      from: deployer,
      log: true,
      args: ['USDT', 'USDT'],
    });
  } else {
    await save('USDT', { abi: IERC20Metadata__factory.abi, address: USDT_ADDRESS });
  }
};

export default func;

func.tags = ['USDT'];
