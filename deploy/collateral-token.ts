import { truncate } from '@ragetrade/sdk';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ClearingHouseLens__factory, ClearingHouse__factory } from '../typechain-types';
import { waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const CollateralTokenDeployment = await deploy('CollateralToken', {
    contract: 'ERC20PresetMinterPauser',
    from: deployer,
    log: true,
    args: ['RageTradeVaultsCollateralToken', 'RTVC'],
    waitConfirmations,
  });

  const clearingHouseLens = ClearingHouseLens__factory.connect(
    (await get('ClearingHouseLens')).address,
    await hre.ethers.getSigner(deployer),
  );

  if (CollateralTokenDeployment.newlyDeployed) {
    await execute(
      'ClearingHouse',
      { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations, log: true },
      'updateCollateralSettings',
      CollateralTokenDeployment.address,
      {
        oracle: (
          await clearingHouseLens.getCollateralInfo(truncate((await get('SettlementToken')).address))
        ).settings.oracle,
        twapDuration: 0,
        isAllowedForDeposit: true,
      },
    );
  }
};

export default func;

func.tags = ['CollateralToken'];
func.dependencies = ['ClearingHouseLens', 'ClearingHouse', 'SettlementToken'];
