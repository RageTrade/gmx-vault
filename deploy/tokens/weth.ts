import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { Weth9Mock__factory } from '../../typechain-types';
import { getNetworkInfo } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save, deploy, execute, read },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { WETH_ADDRESS } = getNetworkInfo(hre.network.config.chainId);

  const mintAmount = parseUnits('1000000000', 18);
  if (WETH_ADDRESS === undefined) {
    // deploying mock
    await deploy('WETH', {
      contract: 'Weth9Mock',
      from: deployer,
      log: true,
      args: [mintAmount],
    });
  } else {
    await save('WETH', { abi: Weth9Mock__factory.abi, address: WETH_ADDRESS });
    const balance: BigNumber = await read('WETH', 'balanceOf', deployer);
    if (balance.isZero()) {
      try {
        await execute('WETH', { from: deployer, log: true }, 'mint', deployer, mintAmount);
      } catch {}
    }
  }
};

export default func;

func.tags = ['WETH'];
