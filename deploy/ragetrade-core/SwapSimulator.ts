import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { SwapSimulator__factory } from '../../typechain-types';
import { getNetworkInfo } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, save },
    getNamedAccounts,
  } = hre;

  const { RAGE_SWAP_SIMULATOR } = getNetworkInfo(hre.network.config.chainId);
  if (RAGE_SWAP_SIMULATOR) {
    await save('SwapSimulator', { abi: SwapSimulator__factory.abi, address: RAGE_SWAP_SIMULATOR });
    console.log('Skipping SwapSimulator.ts deployment, using SwapSimulator from @ragetrade/core');
    return;
  }

  const { deployer } = await getNamedAccounts();

  await deploy('SwapSimulator', {
    from: deployer,
    log: true,
  });
};

export default func;

func.tags = ['SwapSimulator'];
