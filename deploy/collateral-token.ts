import { truncate } from '@ragetrade/sdk';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ClearingHouse__factory } from '../typechain-types';
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

  const { RAGE_CLEARING_HOUSE_ADDRESS, RAGE_SETTLEMENT_TOKEN_ADDRESS } = getNetworkInfo(hre.network.config.chainId);
  if (CollateralTokenDeployment.newlyDeployed && RAGE_CLEARING_HOUSE_ADDRESS) {
    const clearingHouse = ClearingHouse__factory.connect(
      RAGE_CLEARING_HOUSE_ADDRESS ?? (await get('ClearingHouse')).address,
      await hre.ethers.getSigner(deployer),
    );
    await clearingHouse.updateCollateralSettings(CollateralTokenDeployment.address, {
      oracle: (
        await clearingHouse.getCollateralInfo(
          truncate(RAGE_SETTLEMENT_TOKEN_ADDRESS ?? (await get('SettlementToken')).address),
        )
      )[1].oracle,
      twapDuration: 0,
      isAllowedForDeposit: true,
    });
  }

  if (CollateralTokenDeployment.newlyDeployed && hre.network.config.chainId !== 31337) {
    await hre.tenderly.push({
      name: 'ERC20PresetMinterPauser',
      address: CollateralTokenDeployment.address,
    });
  }
};

export default func;

func.tags = ['CollateralToken'];
