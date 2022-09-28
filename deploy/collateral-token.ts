import { ERC20PresetMinterPauser__factory, getNetworkNameFromChainId, truncate } from '@ragetrade/sdk';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ClearingHouseLens__factory, ClearingHouse__factory } from '../typechain-types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get, execute, save },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  try {
    const networkName = getNetworkNameFromChainId(hre.network.config.chainId ?? 31337);
    // this throws if core deployment does not contain a proxy admin
    const tricryptoDeploymentAddress =
      require(`@ragetrade/tricrypto-vault/deployments/${networkName}/CollateralToken.json`).address;
    await save('CollateralToken', {
      abi: ERC20PresetMinterPauser__factory.abi,
      address: tricryptoDeploymentAddress,
    });
    console.log('Saved CollateralToken address:', tricryptoDeploymentAddress);

    return; // if already deployed in other repo then reuse same collateral token
  } catch {
    // if doesn't contain a proxy admin then deploy a new one
    console.log('No core deployment found');
    try {
      // should throw if no ProxyAdmin deployment found
      await get('ProxyAdmin');
      return; // if already deployed then don't (even if openzeppelin version updated)
    } catch {}
  }

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
