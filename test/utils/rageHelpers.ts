import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { truncate } from '@ragetrade/core/test/utils/vToken';
import { ClearingHouse } from '@ragetrade/core/typechain-types';
import { IClearingHouseStructures } from '@ragetrade/core/typechain-types/artifacts/contracts/interfaces/IClearingHouse';
import { expect } from 'chai';
import { BigNumber, BigNumberish, ContractTransaction } from 'ethers';

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

export async function checkNetTokenPosition(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolId: BigNumberish,
  expectedNetTokenPosition: BigNumberish,
) {
  const netTokenPosition = await getNetTokenPosition(clearingHouse, accountNo, poolId);
  expect(netTokenPosition).to.eq(expectedNetTokenPosition);
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
