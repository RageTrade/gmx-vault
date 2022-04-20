import { parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { IERC20Metadata__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save, deploy, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { USDT_ADDRESS } = getNetworkInfo(hre.network.config.chainId);

  if (USDT_ADDRESS === undefined) {
    // deploying mock
    await deploy('USDT', {
      contract: 'TokenMock',
      from: deployer,
      log: true,
      args: ['USDT', 'USDT', 6, parseUnits('1000000000', 6)],
    });

    await execute('USDT', { from: deployer }, 'mint', deployer, parseUnits('1000000000000', 6));
  } else {
    await save('USDT', { abi: IERC20Metadata__factory.abi, address: USDT_ADDRESS });
  }
};

export default func;

func.tags = ['USDT'];
