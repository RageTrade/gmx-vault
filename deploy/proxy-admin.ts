import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkNameFromChainId } from '@ragetrade/sdk';
import { ProxyAdmin__factory } from '../typechain-types';
import { waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, save, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  try {
    const networkName = getNetworkNameFromChainId(hre.network.config.chainId ?? 31337);
    // this throws if core deployment does not contain a proxy admin
    const coreDeploymentProxyAdminAddress =
      require(`@ragetrade/core/deployments/${networkName}/ProxyAdmin.json`).address;
    await save('ProxyAdmin', { abi: ProxyAdmin__factory.abi, address: coreDeploymentProxyAdminAddress });
  } catch {
    // if doesn't contain a proxy admin then deploy a new one
    console.log('No core deployment found');
    try {
      // should throw if no ProxyAdmin deployment found
      await get('ProxyAdmin');
      return; // if already deployed then don't (even if openzeppelin version updated)
    } catch {}
    await deploy('ProxyAdmin', {
      contract: 'ProxyAdmin',
      from: deployer,
      log: true,
      waitConfirmations,
    });
  }
};

export default func;

func.tags = ['ProxyAdmin'];
