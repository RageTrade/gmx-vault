import { expect } from 'chai';
import { BaseContract, BigNumber, BigNumberish } from 'ethers';
import { network } from 'hardhat';
import hre from 'hardhat';
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

export async function checkTotalAssets(
  vault: { totalAssets: () => Promise<BigNumber> },
  expectedTotalAssets: BigNumberish,
) {
  expect(await vault.totalAssets()).to.eq(expectedTotalAssets);
}

export async function checkVaultRangeParams(
  vault: EightyTwentyRangeStrategyVaultTest,
  baseTickLower: number,
  baseTickUpper: number,
  baseLiquidity: BigNumberish,
) {
  expect(await vault.baseLiquidity()).to.eq(baseLiquidity);
  expect(await vault.baseTickLower()).to.eq(baseTickLower);
  expect(await vault.baseTickUpper()).to.eq(baseTickUpper);
}

export async function increaseBlockTimestamp(timestampDelta: number) {
  const block = await hre.ethers.provider.getBlock('latest');
  const curBlockTimestamp = block.timestamp;
  await network.provider.send('evm_setNextBlockTimestamp', [curBlockTimestamp + timestampDelta]);
  await network.provider.send('evm_mine');
}
