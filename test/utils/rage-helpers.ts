import { expect } from 'chai';
import { BigNumber, BigNumberish, ContractTransaction } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { amountsForLiquidity, ClearingHouse, IUniswapV3Pool, sqrtPriceX96ToPrice, truncate } from '@ragetrade/sdk';

import { IClearingHouseStructures } from '../../typechain-types/artifacts/@ragetrade/core/contracts/interfaces/IClearingHouse';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';

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
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolSerialNo: number,
  liquidityPositionSerialNo: number,
): Promise<IClearingHouseStructures.LiquidityPositionViewStructOutput> {
  const accountInfo = await clearingHouse.getAccountInfo(accountNo);
  return accountInfo.tokenPositions[poolSerialNo].liquidityPositions[liquidityPositionSerialNo];
}

export async function getRealTokenBalances(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  collateralTokenAddress: String,
  settlementTokenAddress: String,
): Promise<{ collateralTokenBalance: BigNumber; settlementTokenBalance: BigNumber }> {
  const accountInfo = await clearingHouse.getAccountInfo(accountNo);
  const deposits = accountInfo.collateralDeposits;
  let i = 0;
  let collateralTokenBalance = BigNumber.from(0);
  let settlementTokenBalance = BigNumber.from(0);
  for (i; i < deposits.length; i++) {
    if (deposits[i].collateral == collateralTokenAddress) collateralTokenBalance = deposits[i].balance;
    else if (deposits[i].collateral == settlementTokenAddress) settlementTokenBalance = deposits[i].balance;
  }
  return { collateralTokenBalance, settlementTokenBalance };
}

export async function getLiquidityPositionNum(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolSerialNo: number,
): Promise<number> {
  const accountInfo = await clearingHouse.getAccountInfo(accountNo);
  if (
    typeof accountInfo.tokenPositions === 'undefined' ||
    typeof accountInfo.tokenPositions[poolSerialNo] === 'undefined' ||
    typeof accountInfo.tokenPositions[poolSerialNo].liquidityPositions === 'undefined'
  )
    return 0;
  return accountInfo.tokenPositions[poolSerialNo].liquidityPositions.length;
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
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolSerialNo: number,
  expectedLiquidityPositionNum: number,
) {
  const liquidityPositionNum = await getLiquidityPositionNum(clearingHouse, accountNo, poolSerialNo);
  expect(liquidityPositionNum).to.eq(expectedLiquidityPositionNum);
}

export async function checkLiquidityPosition(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolSerialNo: number,
  liquidityPositionSerialNo: number,
  baseTickLower: number,
  baseTickUpper: number,
  baseLiquidity: BigNumberish,
) {
  const liquidityPosition = await getLiquidityPosition(
    clearingHouse,
    accountNo,
    poolSerialNo,
    liquidityPositionSerialNo,
  );
  expect(liquidityPosition.tickLower).to.eq(baseTickLower);
  expect(liquidityPosition.tickUpper).to.eq(baseTickUpper);
  expect(liquidityPosition.liquidity).to.eq(baseLiquidity);
}

export async function checkLiquidityPositionApproximate(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolSerialNo: number,
  liquidityPositionSerialNo: number,
  baseTickLower: number,
  baseTickUpper: number,
  baseLiquidity: BigNumberish,
) {
  const liquidityPosition = await getLiquidityPosition(
    clearingHouse,
    accountNo,
    poolSerialNo,
    liquidityPositionSerialNo,
  );
  expect(liquidityPosition.tickLower).to.eq(baseTickLower);
  expect(liquidityPosition.tickUpper).to.eq(baseTickUpper);
  expect(liquidityPosition.liquidity.sub(baseLiquidity).abs()).to.lte(10n ** 10n);
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
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  collateralTokenAddress: String,
  settlementTokenAddress: String,
  expectedCollateralTokenBalance: BigNumberish,
  expectedSettlementTokenBalance: BigNumberish,
) {
  const { collateralTokenBalance, settlementTokenBalance } = await getRealTokenBalances(
    clearingHouse,
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
