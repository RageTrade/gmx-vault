import { IERC20__factory } from '@ragetrade/sdk';
import { ethers } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ICurveStableSwap__factory } from '../typechain-types';
import { getNetworkInfo } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { save, deploy, get, read, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { CURVE_TRICRYPTO_POOL, ETH_USD_ORACLE, BTC_USD_ORACLE, USDT_USD_ORACLE } = getNetworkInfo(
    hre.network.config.chainId,
  );

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

    const usdt = IERC20__factory.connect((await get('USDT')).address, hre.ethers.provider);
    console.log(await usdt.balanceOf(deployer));

    await execute(
      'CurveTriCryptoPool',
      { from: deployer },
      'add_liquidity',
      [parseUnits('1000000', 6), parseUnits('20', 8), parseEther('330')],
      0,
    );
  } else {
    await save('CurveTriCryptoPool', { abi: ICurveStableSwap__factory.abi, address: CURVE_TRICRYPTO_POOL });
  }
};

export default func;

func.tags = ['CurveTriCryptoPool'];
func.dependencies = ['CurveToken', 'CurveTriCryptoLpToken', 'WETH', 'WBTC', 'USDT'];
