import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkNameFromChainId, getDeployment, ContractDeployment } from '@ragetrade/sdk';
import { ProxyAdmin__factory } from '../typechain-types';
import { waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, save },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  try {
    const networkName = getNetworkNameFromChainId(hre.network.config.chainId ?? 31337);
    // this throws if core deployment does not contain a proxy admin
    const coreDeployment = await getDeployment('core', networkName, 'ProxyAdmin');
    await save('ProxyAdmin', { abi: ProxyAdmin__factory.abi, address: coreDeployment.address });
  } catch {
    // if doesn't contain a proxy admin then deploy a new one
    console.log('No core deployment found');
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
