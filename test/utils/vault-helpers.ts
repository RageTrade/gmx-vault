import { expect } from 'chai';
import hre, { network } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';
import { BigNumber, BigNumberish, ethers } from 'ethers';

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
  expect((await vault.totalSupply()).sub(expectedTotalSupply).abs()).to.lte(10n ** 15n);
}

export async function checkTotalSupplyGLPApproximate(
  vault: { totalSupply: () => Promise<BigNumber> },
  expectedTotalSupply: BigNumberish,
) {
  expect((await vault.totalSupply()).sub(expectedTotalSupply).abs()).to.lte(2n * 10n ** 18n);
}

export async function checkTotalAssets(
  vault: { totalAssets: () => Promise<BigNumber> },
  expectedTotalAssets: BigNumberish,
) {
  expect(await vault.totalAssets()).to.eq(expectedTotalAssets);
}

export async function checkTotalGLPApproximate(
  vault: { totalAssets: () => Promise<BigNumber> },
  expectedTotalAssets: BigNumberish,
) {
  // console.log('from excel', expectedTotalAssets);
  // console.log('from contract', await vault.totalAssets());
  expect((await vault.totalAssets()).sub(expectedTotalAssets).abs()).to.lte(2n * 10n ** 18n);
}

export async function checkTotalAssetsApproximate(
  vault: { totalAssets: () => Promise<BigNumber> },
  expectedTotalAssets: BigNumberish,
) {
  expect((await vault.totalAssets()).sub(expectedTotalAssets).abs()).to.lte(10n ** 15n);
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
  expect((await vault.baseLiquidity()).sub(baseLiquidity).abs()).to.lte(10n ** 10n);
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

export const changeEthPriceInGLP = async (price: number) => {
  // const signer = (await hre.ethers.getSigners())[0]

  // const primaryFeed = IVaultPriceFeed__factory.connect('0xa18bb1003686d0854ef989bb936211c59eb6e363', signer)

  // const secondaryFeed = ISecondaryPriceFeed__factory.connect('0x1a0ad27350cccd6f7f168e052100b4960efdb774', signer)

  // const ethFeed = AggregatorV3Interface__factory.connect('0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612', signer)

  // const populated = await ethFeed.populateTransaction.latestRoundData()
  // const tx = await signer.sendTransaction(populated);

  // const result = await hre.network.provider.send('debug_traceTransaction', [tx.hash]);

  // const keys = (result.structLogs as any[])
  //   .filter((s: { op: string }) => s.op == 'SLOAD')
  //   .map((s: { stack: string[] }) => {
  //     const slotKey = (s.stack as string[]).pop();
  //     if (slotKey === undefined) {
  //       throw new Error('bad SLOAD');
  //     }
  //     return slotKey;
  //   });

  // if (keys.length === 0) {
  //   throw new Error('SLOAD not found');
  // }

  // console.log(keys);

  await hre.network.provider.send('hardhat_setStorageAt', [
    '0x3607e46698d218B3a5Cae44bF381475C0a5e2ca7', // address
    '0x265b84761fa8813caeca7f721d05ef6bdf526034306315bc1279417cc7c803ba', // slot
    ethers.utils.hexZeroPad(parseUnits(price.toString(), 8).toHexString(), 32), // new value
  ]);

  await increaseBlockTimestamp(310);
};
