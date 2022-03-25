import { ClearingHouse } from '@ragetrade/core/typechain-types';
import { IClearingHouseStructures } from '@ragetrade/core/typechain-types/artifacts/contracts/interfaces/IClearingHouse';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';

export async function getLiquidityPosition(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolSerialNo: number,
  liquidityPositionSerialNo: number,
): Promise<IClearingHouseStructures.LiquidityPositionViewStructOutput> {
  const accountInfo = await clearingHouse.getAccountInfo(accountNo);
  return accountInfo.tokenPositions[poolSerialNo].liquidityPositions[liquidityPositionSerialNo];
}

export async function getNetTokenPosition(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolId: BigNumberish,
): Promise<BigNumber> {
  return clearingHouse.getAccountNetTokenPosition(accountNo, poolId);
}

export async function checkLiquidityPosition(
  clearingHouse: ClearingHouse,
  accountNo: BigNumber,
  poolSerialNo: number,
  liquidityPositionSerialNo: number,
  baseTickLower: number,
  baseTickUpper: number,
  baseLiquidity: BigNumber,
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
  expectedNetTokenPosition: BigNumber,
) {
  const netTokenPosition = await getNetTokenPosition(clearingHouse, accountNo, poolId);
  expect(netTokenPosition).to.eq(expectedNetTokenPosition);
}
