import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
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

  const { WBTC_ADDRESS } = getNetworkInfo(hre.network.config.chainId);

  const mintAmount = parseUnits('21000000', 8);
  if (WBTC_ADDRESS === undefined) {
    // deploying mock
    await deploy('WBTC', {
      contract: 'TokenMock',
      from: deployer,
      log: true,
      args: ['Wrapped Bitcoin', 'WBTC', 8, mintAmount],
    });
  } else {
    await save('WBTC', { abi: ERC20PresetMinterPauser__factory.abi, address: WBTC_ADDRESS });
    const balance: BigNumber = await read('WBTC', 'balanceOf', deployer);
    if (balance.isZero()) {
      try {
        await execute('WBTC', { from: deployer, log: true }, 'mint', deployer, mintAmount);
      } catch {}
    }
  }
};

export default func;

func.tags = ['WBTC'];
