import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkNameFromChainId, getDeployment, ContractDeployment } from '@ragetrade/sdk';
import { ProxyAdmin__factory } from '../typechain-types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, save },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  let coreDeployment: ContractDeployment | undefined;
  try {
    const networkName = getNetworkNameFromChainId(hre.network.config.chainId ?? 31337);
    coreDeployment = await getDeployment(networkName, 'ProxyAdmin');
  } catch {}

  if (coreDeployment) {
    // if core deployment contains a proxy admin, use it
    await save('ProxyAdmin', { abi: ProxyAdmin__factory.abi, address: coreDeployment.address });
  } else {
    // if doesn't contain a proxy admin then deploy a new one
    const deployment = await deploy('ProxyAdmin', {
      contract: 'ProxyAdmin',
      from: deployer,
      log: true,
    });

    if (deployment.newlyDeployed && hre.network.config.chainId !== 31337) {
      await hre.tenderly.push({
        name: 'ProxyAdmin',
        address: deployment.address,
      });
    }
  }
};

export default func;

func.tags = ['ProxyAdmin'];
