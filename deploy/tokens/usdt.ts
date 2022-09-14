import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { read } from 'fs';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ERC20PresetMinterPauser__factory } from '../../typechain-types';
import { getNetworkInfo } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save, deploy, execute, read },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { USDT_ADDRESS } = getNetworkInfo(hre.network.config.chainId);

  const mintAmount = parseUnits('1000000000000', 6);
  if (USDT_ADDRESS === undefined) {
    // deploying mock
    await deploy('USDT', {
      contract: 'TokenMock',
      from: deployer,
      log: true,
      args: ['USDT', 'USDT', 6, mintAmount],
    });
  } else {
    await save('USDT', { abi: ERC20PresetMinterPauser__factory.abi, address: USDT_ADDRESS });
    const balance: BigNumber = await read('USDT', 'balanceOf', deployer);
    if (balance.isZero()) {
      try {
        await execute('USDT', { from: deployer, log: true }, 'mint', deployer, mintAmount);
      } catch {}
    }
  }
};

export default func;

func.tags = ['USDT'];
