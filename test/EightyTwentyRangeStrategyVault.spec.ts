import hre from 'hardhat';
import { parseTokenAmount } from '@ragetrade/core/test/utils/stealFunds';
import {
  ClearingHouse,
  EightyTwentyRangeStrategyVaultTest,
  SettlementTokenMock,
  VPoolWrapper__factory,
} from '../typechain-types';
import { eightyTwentyRangeStrategyFixture } from './fixtures/eighty-twenty-range-strategy-vault';
import { BigNumber, BigNumberish } from 'ethers';
import { expect } from 'chai';
import {
  checkLiquidityPosition,
  checkLiquidityPositionNum,
  checkNetTokenPosition,
  checkRealTokenBalances,
  getLiquidityPosition,
  swapToken,
} from './utils/rageHelpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  checkTotalAssets,
  checkTotalSupply,
  checkVaultRangeParams,
  increaseBlockTimestamp,
} from './utils/vaultHelpers';
import { sqrtPriceX96ToTick } from '@ragetrade/core/test/utils/price-tick';

describe('EightyTwentyRangeStrategyVault', () => {
  before(async () => {
    // deploys contracts once
    await eightyTwentyRangeStrategyFixture();
  });

  describe('#Deposit', () => {
    it('First Deposit', async () => {
      const [, user0] = await hre.ethers.getSigners();
      const {
        eightyTwentyRangeStrategyVaultTest,
        clearingHouse,
        vaultAccountNo,
        settlementTokenTreasury,
        collateralToken,
        settlementToken,
        ethPoolId,
        ethPool,
      } = await eightyTwentyRangeStrategyFixture();

      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 3n, 18), user0.address);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 3n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 3n, 18));
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -202300, -184440, 4392187773328n);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -202300, -184440, 4392187773328n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);

      //Collateral Token Balance 1e-6 USD lesser due to round down in market value calculation
      await checkRealTokenBalances(
        clearingHouse,
        vaultAccountNo,
        collateralToken.address,
        settlementToken.address,
        parseTokenAmount(10n ** 3n, 18).sub(parseTokenAmount(1n, 12)),
        0n,
      );
    });
  });

  describe('#Withdraw', () => {
    it('Partial Withdraw', async () => {
      const [, user0] = await hre.ethers.getSigners();
      const {
        eightyTwentyRangeStrategyVaultTest,
        clearingHouse,
        vaultAccountNo,
        settlementTokenTreasury,
        collateralToken,
        settlementToken,
        ethPoolId,
      } = await eightyTwentyRangeStrategyFixture();

      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 3n, 18), user0.address);

      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .withdraw(parseTokenAmount(10n ** 2n, 18), user0.address, user0.address);

      //900 - 2e-6 due to rounding down of account market value
      const initialTotalAssets = parseTokenAmount(1000n, 18).sub(parseTokenAmount(2n, 12));
      const finalTotalAssets = initialTotalAssets.sub(parseTokenAmount(100n, 18));
      const initialTotalSupply = parseTokenAmount(1000n, 18);
      const finalTotalSupply = initialTotalSupply.mul(finalTotalAssets).div(initialTotalAssets);
      const initialLiquidity = BigNumber.from(4392187773328n);
      const finalLiquidity = initialLiquidity.mul(finalTotalAssets).div(initialTotalAssets).add(1);

      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, finalTotalAssets);
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, finalTotalSupply);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -202300, -184440, finalLiquidity);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -202300, -184440, finalLiquidity);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);

      await checkRealTokenBalances(
        clearingHouse,
        vaultAccountNo,
        collateralToken.address,
        settlementToken.address,
        parseTokenAmount(900n, 18),
        0n,
      );
    });
    it('Full Withdraw', async () => {
      const [, user0] = await hre.ethers.getSigners();
      const {
        eightyTwentyRangeStrategyVaultTest,
        clearingHouse,
        vaultAccountNo,
        settlementTokenTreasury,
        ethPool,
        collateralToken,
        settlementToken,
        ethPoolId,
      } = await eightyTwentyRangeStrategyFixture();

      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 3n, 18), user0.address);

      //Withdraw all shares
      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .redeem(parseTokenAmount(10n ** 3n, 18), user0.address, user0.address);

      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(0n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(0n, 18));
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -202300, -184440, 0n);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 0);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, 0n);

      //Initial loss due to precision errors
      await checkRealTokenBalances(
        clearingHouse,
        vaultAccountNo,
        collateralToken.address,
        settlementToken.address,
        parseTokenAmount(2n, 12),
        0n,
      );
    });
  });
});
