import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { VaultPeriphery } from '../../typechain-types';
import { getNetworkInfo, waitConfirmations } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const logicDeployment = await deploy('VaultPeriphery', {
    contract: 'VaultPeriphery',
    from: deployer,
    log: true,
  });

  // const { RAGE_SETTLEMENT_TOKEN_ADDRESS, UNISWAP_V3_ROUTER_ADDRESS, ETH_USD_ORACLE }
  const networkInfo = getNetworkInfo(hre.network.config.chainId);

  const initializeArgs: Parameters<VaultPeriphery['initialize']> = [
    (await get('SettlementToken')).address,
    (await get('USDT')).address,
    (await get('WETH')).address,
    (await get('CurveTriCryptoLpToken')).address,
    (await get('CurveYieldStrategy')).address,
    networkInfo.UNISWAP_V3_ROUTER_ADDRESS,
    (await get('CurveQuoter')).address,
    (await get('CurveTriCryptoPool')).address,
    networkInfo.ETH_USD_ORACLE,
  ];

  if (logicDeployment.newlyDeployed) {
    await execute('VaultPeriphery', { from: deployer, waitConfirmations, log: true }, 'initialize', ...initializeArgs);

    // transfer ownership to team multisig
    await execute(
      'VaultPeriphery',
      { from: deployer, estimateGasExtra: 1_000_000, waitConfirmations },
      'transferOwnership',
      networkInfo.MULTISIG,
    );
  }
};

export default func;

func.tags = ['VaultPeriphery'];
func.dependencies = ['vETH', 'CurveYieldStrategy', 'USDT', 'WETH'];
