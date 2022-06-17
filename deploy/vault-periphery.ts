import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { VaultPeriphery } from '../typechain-types';
import { getNetworkInfo, waitConfirmations } from './network-info';

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
    networkInfo.RAGE_SETTLEMENT_TOKEN_ADDRESS ?? (await get('SettlementToken')).address,
    networkInfo.USDT_ADDRESS,
    networkInfo.WETH_ADDRESS,
    networkInfo.CURVE_TRICRYPTO_LP_TOKEN,
    (await get('CurveYieldStrategy')).address,
    networkInfo.UNISWAP_V3_ROUTER_ADDRESS,
    networkInfo.CURVE_QUOTER,
    networkInfo.CURVE_TRICRYPTO_POOL,
    networkInfo.ETH_USD_ORACLE,
  ];

  if (logicDeployment.newlyDeployed) {
    await execute('VaultPeriphery', { from: deployer, waitConfirmations }, 'initialize', ...initializeArgs);
  }
};

export default func;

func.tags = ['VaultPeriphery'];
func.dependencies = ['vETH', 'CurveYieldStrategy'];
