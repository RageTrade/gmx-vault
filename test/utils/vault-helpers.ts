import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import hre, { network } from 'hardhat';

import { EightyTwentyRangeStrategyVaultTest } from '../../typechain-types';

export async function setYieldTokenPrice(vault: EightyTwentyRangeStrategyVaultTest, priceX128: BigNumberish) {
  await vault.setYieldTokenPriceX128(priceX128);
}

export async function checkTotalSupply(
  vault: { totalSupply: () => Promise<BigNumber> },
  expectedTotalSupply: BigNumberish,
) {
  expect(await vault.totalSupply()).to.eq(expectedTotalSupply);
}

export async function checkTotalSupplyApproximate(
  vault: { totalSupply: () => Promise<BigNumber> },
  expectedTotalSupply: BigNumberish,
) {
  expect((await vault.totalSupply()).sub(expectedTotalSupply).abs()).to.lte(10n ** 12n);
}

export async function checkTotalAssets(
  vault: { totalAssets: () => Promise<BigNumber> },
  expectedTotalAssets: BigNumberish,
) {
  expect(await vault.totalAssets()).to.eq(expectedTotalAssets);
}

export async function checkTotalAssetsApproximate(
  vault: { totalAssets: () => Promise<BigNumber> },
  expectedTotalAssets: BigNumberish,
) {
  expect((await vault.totalAssets()).sub(expectedTotalAssets).abs()).to.lte(10n ** 12n);
}

export async function checkVaultRangeParams(
  vault: {
    baseTickLower: () => Promise<number>;
    baseTickUpper: () => Promise<number>;
    baseLiquidity: () => Promise<BigNumber>;
  },
  baseTickLower: number,
  baseTickUpper: number,
  baseLiquidity: BigNumberish,
) {
  expect(await vault.baseLiquidity()).to.eq(baseLiquidity);
  expect(await vault.baseTickLower()).to.eq(baseTickLower);
  expect(await vault.baseTickUpper()).to.eq(baseTickUpper);
}

export async function checkVaultRangeParamsApproximate(
  vault: {
    baseTickLower: () => Promise<number>;
    baseTickUpper: () => Promise<number>;
    baseLiquidity: () => Promise<BigNumber>;
  },
  baseTickLower: number,
  baseTickUpper: number,
  baseLiquidity: BigNumberish,
) {
  expect((await vault.baseLiquidity()).sub(baseLiquidity).abs()).to.lte(10n ** 8n);
  expect(await vault.baseTickLower()).to.eq(baseTickLower);
  expect(await vault.baseTickUpper()).to.eq(baseTickUpper);
}

export async function increaseBlockTimestamp(timestampDelta: number) {
  const block = await hre.ethers.provider.getBlock('latest');
  const curBlockTimestamp = block.timestamp;
  await network.provider.send('evm_setNextBlockTimestamp', [curBlockTimestamp + timestampDelta]);
  await network.provider.send('evm_mine');
}

export async function logVaultParams(
  title: string,
  vault: {
    totalSupply: () => Promise<BigNumber>;
    totalAssets: () => Promise<BigNumber>;
    baseTickLower: () => Promise<number>;
    baseTickUpper: () => Promise<number>;
    baseLiquidity: () => Promise<BigNumber>;
  },
) {
  console.log('#######', title, '#######');
  console.log('totalAssets', await vault.totalAssets(), 'totalSupply', await vault.totalSupply());
  console.log(
    'baseTickLower',
    await vault.baseTickLower(),
    'baseTickUpper',
    await vault.baseTickUpper(),
    'baseLiquidity',
    await vault.baseLiquidity(),
  );
}
