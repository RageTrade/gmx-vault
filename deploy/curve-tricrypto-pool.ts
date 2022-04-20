import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ICurveStableSwap__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save, deploy, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { CURVE_TRICRYPTO_POOL, ETH_USD_ORACLE, BTC_USD_ORACLE, USDT_USD_ORACLE } = getNetworkInfo(
    hre.network.config.chainId,
  );

  if (CURVE_TRICRYPTO_POOL === undefined) {
    // deploying mock
    await deploy('CurveTriCryptoPool', {
      contract: 'StableSwapMock',
      from: deployer,
      log: true,
      args: [
        (await get('CurveTriCryptoLpToken')).address,
        [(await get('WETH')).address, (await get('WBTC')).address, (await get('USDT')).address],
        [ETH_USD_ORACLE, BTC_USD_ORACLE, USDT_USD_ORACLE],
      ],
    });
  } else {
    await save('CurveTriCryptoPool', { abi: ICurveStableSwap__factory.abi, address: CURVE_TRICRYPTO_POOL });
  }
};

export default func;

func.tags = ['CurveTriCryptoPool'];
func.dependencies = ['CurveToken', 'CurveTriCryptoLpToken', 'WETH', 'WBTC', 'USDT'];
