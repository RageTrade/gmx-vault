import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { IERC20Metadata__factory } from '../../typechain-types';
import { getNetworkInfo } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, save, execute },
    getNamedAccounts,
  } = hre;

  const { RAGE_SETTLEMENT_TOKEN_ADDRESS } = getNetworkInfo(hre.network.config.chainId);
  if (RAGE_SETTLEMENT_TOKEN_ADDRESS) {
    await save('SettlementToken', { abi: IERC20Metadata__factory.abi, address: RAGE_SETTLEMENT_TOKEN_ADDRESS });
    console.log('Skipping SettlementToken.ts deployment, using SettlementToken from @ragetrade/core');
    return;
  }

  const { deployer } = await getNamedAccounts();

  await deploy('SettlementToken', {
    contract: 'SettlementTokenMock',
    from: deployer,
    log: true,
  });

  await execute('SettlementToken', { from: deployer }, 'mint', deployer, hre.ethers.BigNumber.from(10).pow(8));
};

export default func;

func.tags = ['SettlementToken'];
