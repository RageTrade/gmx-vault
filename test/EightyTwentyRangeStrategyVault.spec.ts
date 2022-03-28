import hre from 'hardhat';
import { parseTokenAmount } from '@ragetrade/core/test/utils/stealFunds';
import { ClearingHouse, EightyTwentyRangeStrategyVaultTest, SettlementTokenMock } from '../typechain-types';
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
    it('should perform first deposit', async () => {
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
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -202300, -184440, 4392187773328n);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -202300, -184440, 4392187773328n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 3n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 3n, 18));

      //Collateral Token Balance 1e-6 USD low due to round down in market value calculation
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
    it('should perform full withdraw with zero assets afterwards', async () => {
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
        .withdraw(parseTokenAmount(10n ** 3n, 18), user0.address, user0.address);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 0);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -202300, -184440, 0);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(0, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(0, 18));
    });
  });

  describe.skip('#Scenario1', () => {
    it('Test Scenario 1', async () => {
      const [, user0] = await hre.ethers.getSigners();

      const {
        eightyTwentyRangeStrategyVaultTest,
        clearingHouse,
        vaultAccountNo,
        settlementTokenTreasury,
        settlementToken,
        ethPoolId,
      } = await eightyTwentyRangeStrategyFixture();
      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 3n, 18), user0.address);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);

      await increaseBlockTimestamp(100);
      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .withdraw(parseTokenAmount(10n ** 3n, 18), user0.address, user0.address);

      // await swapToken(clearingHouse,user0,user0,ethPoolId,parseTokenAmount(1,18),0,false,false);

      await eightyTwentyRangeStrategyVaultTest.rebalance();
      //Set starting price of pool
      //Set timestamp to 0 (set real price)
      //user0 deposits
      //Set timestamp (set real price)
      //user1 swaps on rage trade

      // swapToken(clearingHouse,)
      //user2 deposits
      //Rebalance
      //Checks -

      //Net token position (inside and outside)
    });
  });
});
