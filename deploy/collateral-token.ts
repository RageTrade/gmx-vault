import { truncate } from '@ragetrade/sdk';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ClearingHouseLens__factory, ClearingHouse__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const CollateralTokenDeployment = await deploy('CollateralToken', {
    contract: 'ERC20PresetMinterPauser',
    from: deployer,
    log: true,
    args: ['RageTradeVaultsCollateralToken', 'RTVC'],
  });

  const clearingHouseLens = ClearingHouseLens__factory.connect(
    (await get('ClearingHouseLens')).address,
    await hre.ethers.getSigner(deployer),
  );

  if (CollateralTokenDeployment.newlyDeployed) {
    const clearingHouse = ClearingHouse__factory.connect(
      (await get('ClearingHouse')).address,
      await hre.ethers.getSigner(deployer),
    );
    await clearingHouse.updateCollateralSettings(CollateralTokenDeployment.address, {
      oracle: (await clearingHouseLens.getCollateralInfo(truncate((await get('SettlementToken')).address)))[1].oracle,
      twapDuration: 0,
      isAllowedForDeposit: true,
    });
  }
};

export default func;

func.tags = ['CollateralToken'];
func.dependencies = ['ClearingHouseLens', 'ClearingHouse', 'SettlementToken'];
