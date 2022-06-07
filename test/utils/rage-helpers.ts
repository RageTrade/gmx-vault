import { expect } from 'chai';
import { BigNumber, BigNumberish, ContractTransaction } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { amountsForLiquidity, ClearingHouse, IUniswapV3Pool, sqrtPriceX96ToPrice, truncate } from '@ragetrade/sdk';

import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';
import { ClearingHouseLens } from '../../typechain-types';

export async function updateSettlementTokenMargin(
  clearingHouse: ClearingHouse,
  settlementToken: ERC20,
  user: SignerWithAddress,
  userAccountNo: BigNumberish,
  vTokenAmount: BigNumberish,
) {
  await settlementToken.connect(user).approve(clearingHouse.address, vTokenAmount);
  await clearingHouse.connect(user).updateMargin(userAccountNo, truncate(settlementToken.address), vTokenAmount);
}

export async function swapToken(
  clearingHouse: ClearingHouse,
  user: SignerWithAddress,
  userAccountNo: BigNumberish,
  poolId: string,
  amount: BigNumberish,
  sqrtPriceLimit: BigNumberish,
  isNotional: boolean,
  isPartialAllowed: boolean,
): Promise<ContractTransaction> {
  const swapParams = {
    amount: amount,
    sqrtPriceLimit: sqrtPriceLimit,
    isNotional: isNotional,
    isPartialAllowed: isPartialAllowed,
    settleProfit: false,
  };
  return await clearingHouse.connect(user).swapToken(userAccountNo, poolId, swapParams);
}

export async function getLiquidityPosition(
  clearingHouseLens: ClearingHouseLens,
  accountNo: BigNumber,
  poolId: BigNumberish,
  liquidityPositionSerialNo: number,
) {
  const accountInfo = await clearingHouseLens.getAccountLiquidityPositionList(accountNo, poolId);
  return accountInfo[liquidityPositionSerialNo];
}

export async function getRealTokenBalances(
  clearingHouseLens: ClearingHouseLens,
  accountNo: BigNumber,
  collateralTokenAddress: string,
  settlementTokenAddress: string,
): Promise<{ collateralTokenBalance: BigNumber; settlementTokenBalance: BigNumber }> {
  const collateralTokenBalance = await clearingHouseLens.getAccountCollateralBalance(
    accountNo,
    truncate(collateralTokenAddress),
  );
  const settlementTokenBalance = await clearingHouseLens.getAccountCollateralBalance(
    accountNo,
    truncate(settlementTokenAddress),
  );

  return { collateralTokenBalance, settlementTokenBalance };
}

export async function getLiquidityPositionNum(
  clearingHouseLens: ClearingHouseLens,
  accountNo: BigNumber,
  poolId: BigNumberish,
): Promise<number> {
  console.log('POOL ID :', poolId);
  console.log(await clearingHouseLens.getAccountPositionInfo(accountNo, poolId));
  const accountInfo = await clearingHouseLens.getAccountLiquidityPositionList(accountNo, poolId);
  console.log('accountInfo', accountInfo);
  if (typeof accountInfo === 'undefined') return 0;
  return accountInfo.length;
}

export async function getNetTokenPosition(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolId: BigNumberish,
): Promise<BigNumber> {
  return clearingHouse.getAccountNetTokenPosition(accountNo, poolId);
}

export async function getAccountNetProfit(clearingHouse: ClearingHouse, accountNo: BigNumber) {
  return clearingHouse.getAccountNetProfit(accountNo);
}

export async function checkLiquidityPositionNum(
  clearingHouseLens: ClearingHouseLens,
  accountNo: BigNumber,
  poolId: BigNumberish,
  expectedLiquidityPositionNum: number,
) {
  const liquidityPositionNum = await getLiquidityPositionNum(clearingHouseLens, accountNo, poolId);
  expect(liquidityPositionNum).to.eq(expectedLiquidityPositionNum);
}

export async function checkLiquidityPosition(
  clearingHouseLens: ClearingHouseLens,
  accountNo: BigNumber,
  poolId: BigNumberish,
  liquidityPositionSerialNo: number,
  baseTickLower: number,
  baseTickUpper: number,
  baseLiquidity: BigNumberish,
) {
  const liquidityPosition = await getLiquidityPosition(clearingHouseLens, accountNo, poolId, liquidityPositionSerialNo);

  const liquidityInfo = await clearingHouseLens.getAccountLiquidityPositionInfo(
    accountNo,
    poolId,
    liquidityPosition.tickLower,
    liquidityPosition.tickUpper,
  );
  expect(liquidityInfo.liquidity).to.eq(baseLiquidity);
  expect(liquidityPosition.tickLower).to.eq(baseTickLower);
  expect(liquidityPosition.tickUpper).to.eq(baseTickUpper);
}

export async function checkLiquidityPositionApproximate(
  clearingHouseLens: ClearingHouseLens,
  accountNo: BigNumber,
  poolId: BigNumberish,
  liquidityPositionSerialNo: number,
  baseTickLower: number,
  baseTickUpper: number,
  baseLiquidity: BigNumberish,
) {
  const liquidityPosition = await getLiquidityPosition(clearingHouseLens, accountNo, poolId, liquidityPositionSerialNo);

  const liquidityInfo = await clearingHouseLens.getAccountLiquidityPositionInfo(
    accountNo,
    poolId,
    liquidityPosition.tickLower,
    liquidityPosition.tickUpper,
  );

  expect(liquidityPosition.tickLower).to.eq(baseTickLower);
  expect(liquidityPosition.tickUpper).to.eq(baseTickUpper);
  expect(liquidityInfo.liquidity.sub(baseLiquidity).abs()).to.lte(10n ** 10n);
}

export async function checkNetTokenPosition(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolId: BigNumberish,
  expectedNetTokenPosition: BigNumberish,
) {
  const netTokenPosition = await getNetTokenPosition(clearingHouse, accountNo, poolId);
  expect(netTokenPosition).to.eq(expectedNetTokenPosition);
}

export async function checkNetTokenPositionApproximate(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolId: BigNumberish,
  expectedNetTokenPosition: BigNumberish,
) {
  const netTokenPosition = await getNetTokenPosition(clearingHouse, accountNo, poolId);
  expect(netTokenPosition.sub(expectedNetTokenPosition).abs()).to.lte(10n ** 13n);
}

export async function checkAccountNetProfit(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  expectedNetProfit: BigNumberish,
) {
  const netProfit = await getAccountNetProfit(clearingHouse, accountNo);
  expect(netProfit).to.eq(expectedNetProfit);
}

export async function checkRealTokenBalances(
  clearingHouseLens: ClearingHouseLens,
  accountNo: BigNumber,
  collateralTokenAddress: string,
  settlementTokenAddress: string,
  expectedCollateralTokenBalance: BigNumberish,
  expectedSettlementTokenBalance: BigNumberish,
) {
  const { collateralTokenBalance, settlementTokenBalance } = await getRealTokenBalances(
    clearingHouseLens,
    accountNo,
    collateralTokenAddress,
    settlementTokenAddress,
  );
  expect(collateralTokenBalance).to.eq(expectedCollateralTokenBalance);
  expect(settlementTokenBalance).to.eq(expectedSettlementTokenBalance);
}

export async function logRageParams(
  title: string,
  clearingHouse: ClearingHouse,
  vPool: IUniswapV3Pool,
  accountNo: BigNumber,
  poolSerialNo: number,
  liquidityPositionSerialNo: number,
) {
  console.log('#######', title, '#######');
  const accountInfo = await clearingHouse.getAccountInfo(accountNo);
  const tokenPosition = accountInfo.tokenPositions[poolSerialNo];
  const liquidityPosition = tokenPosition.liquidityPositions[liquidityPositionSerialNo];
  console.log(
    'Trader States:',
    'vQuoteBalance',
    accountInfo.vQuoteBalance,
    'vTokenBalance',
    tokenPosition.balance,
    'netTraderPosition',
    tokenPosition.netTraderPosition,
  );

  console.log('Account Net Profit:', await clearingHouse.getAccountNetProfit(accountNo));

  const { sqrtPriceX96 } = await vPool.slot0();
  const amounts = amountsForLiquidity(
    liquidityPosition.tickLower,
    sqrtPriceX96,
    liquidityPosition.tickUpper,
    liquidityPosition.liquidity,
    false,
  );
  console.log(
    'Inside Range:',
    'vQuoteBalance',
    amounts.vQuoteAmount,
    'vTokenBalance',
    amounts.vTokenAmount,
    'Price',
    await sqrtPriceX96ToPrice(sqrtPriceX96, 6, 18),
  );
}
