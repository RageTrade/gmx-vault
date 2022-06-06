import addresses from './addresses';
import { deployments } from 'hardhat';
import { curveYieldStrategyFixture } from './curve-yield-strategy';
import { VaultPeriphery__factory } from '../../typechain-types';
import { ethers } from 'ethers';

export const vaultPeripheryFixture = deployments.createFixture(async hre => {
  const { curveYieldStrategyTest: vault, usdc, weth, lpOracle, wethOracle } = await curveYieldStrategyFixture();

  await vault.grantAllowances();

  const [admin] = await hre.ethers.getSigners();
  const vaultPeripheryFactory = new VaultPeriphery__factory(admin);

  const vaultPeriphery = await vaultPeripheryFactory.deploy();

  await vaultPeriphery.initialize(
    addresses.USDC,
    addresses.USDT,
    addresses.WETH,
    addresses.TRICRYPTO_LP_TOKEN,
    vault.address,
    addresses.ROUTER,
    addresses.QUOTER,
    addresses.TRICRYPTO_POOL,
    addresses.WETH_ORACLE,
  );

  await vault.updateBaseParams(ethers.constants.MaxUint256, ethers.constants.AddressZero, 0, 0);

  return {
    weth,
    usdc,
    vault,
    lpOracle,
    wethOracle,
    vaultPeriphery,
  };
});
