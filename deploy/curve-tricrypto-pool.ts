import {
  ERC20PresetMinterPauser__factory,
  IUniswapV3Pool__factory,
  priceToSqrtPriceX96,
  priceToTick,
} from '@ragetrade/sdk';

import { BigNumber, ethers } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import {
  ICurveStableSwap__factory,
  NonfungiblePositionManager__factory,
  UniswapV3Factory__factory,
} from '../typechain-types';
import { getNetworkInfo, UNISWAP_V3_FACTORY_ADDRESS } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save, deploy, get, read, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { CURVE_TRICRYPTO_POOL, ETH_USD_ORACLE, BTC_USD_ORACLE, USDT_USD_ORACLE, RAGE_SETTLEMENT_TOKEN_ADDRESS } =
    getNetworkInfo(hre.network.config.chainId);

  if (CURVE_TRICRYPTO_POOL === undefined) {
    // deploying mock
    const CurveTriCryptoPoolDeployment = await deploy('CurveTriCryptoPool', {
      contract: 'StableSwapMock',
      from: deployer,
      log: true,
      args: [
        (await get('CurveTriCryptoLpToken')).address,
        [(await get('USDT')).address, (await get('WBTC')).address, (await get('WETH')).address],
        [USDT_USD_ORACLE, BTC_USD_ORACLE, ETH_USD_ORACLE],
      ],
    });

    if (CurveTriCryptoPoolDeployment.newlyDeployed) {
      await execute(
        'WETH',
        { from: deployer },
        'approve',
        CurveTriCryptoPoolDeployment.address,
        ethers.constants.MaxUint256,
      );
      await execute(
        'WBTC',
        { from: deployer },
        'approve',
        CurveTriCryptoPoolDeployment.address,
        ethers.constants.MaxUint256,
      );

      await execute(
        'USDT',
        { from: deployer },
        'approve',
        CurveTriCryptoPoolDeployment.address,
        ethers.constants.MaxUint256,
      );

      const MINTER_ROLE = await read('CurveTriCryptoLpToken', 'MINTER_ROLE');
      await execute(
        'CurveTriCryptoLpToken',
        { from: deployer },
        'grantRole',
        MINTER_ROLE,
        CurveTriCryptoPoolDeployment.address,
      );

      await execute(
        'CurveTriCryptoPool',
        { from: deployer, gasLimit: 20_000_000 },
        'add_liquidity',
        [parseUnits('1000000000', 6), parseUnits('20000', 8), parseEther('330000')],
        0,
      );
    }
  } else {
    await save('CurveTriCryptoPool', { abi: ICurveStableSwap__factory.abi, address: CURVE_TRICRYPTO_POOL });
  }
};

export default func;

func.tags = ['CurveTriCryptoPool'];
func.dependencies = ['SettlementToken', 'CurveTriCryptoLpToken', 'WETH', 'WBTC', 'USDT'];
