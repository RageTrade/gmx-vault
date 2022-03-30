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
  checkAccountNetProfit,
  checkLiquidityPosition,
  checkLiquidityPositionApproximate,
  checkLiquidityPositionNum,
  checkNetTokenPosition,
  checkRealTokenBalances,
  getLiquidityPosition,
  swapToken,
  updateSettlementTokenMargin,
} from './utils/rageHelpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  checkTotalAssets,
  checkTotalAssetsApproximate,
  checkTotalSupply,
  checkTotalSupplyApproximate,
  checkVaultRangeParams,
  checkVaultRangeParamsApproximate,
  increaseBlockTimestamp,
} from './utils/vaultHelpers';
import {
  priceToPriceX128,
  priceX128ToPrice,
  priceX128ToSqrtPriceX96,
  sqrtPriceX96ToPrice,
  sqrtPriceX96ToTick,
  tickToSqrtPriceX96,
} from '@ragetrade/core/test/utils/price-tick';

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
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036057856n);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 7895036057856n);
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

    it('Deposit cap', async () => {
      const [, user0] = await hre.ethers.getSigners();
      const { eightyTwentyRangeStrategyVaultTest } = await eightyTwentyRangeStrategyFixture();

      await eightyTwentyRangeStrategyVaultTest.updateDepositCap(parseTokenAmount(1, 18));
      await expect(
        eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(1, 18).add(1), user0.address),
      ).to.be.revertedWith('BV_DepositCap(1000000000000000000, 1000000000000000001)');
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
      const initialTotalAssets = parseTokenAmount(1000n, 18).sub(parseTokenAmount(3n, 12));
      const finalTotalAssets = initialTotalAssets.sub(parseTokenAmount(100n, 18));
      const initialTotalSupply = parseTokenAmount(1000n, 18);
      const finalTotalSupply = initialTotalSupply.mul(finalTotalAssets).div(initialTotalAssets);
      const initialLiquidity = BigNumber.from(7895036057856n);
      const finalLiquidity = initialLiquidity.mul(finalTotalAssets).div(initialTotalAssets).add(1);

      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, finalTotalAssets);
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, finalTotalSupply);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, finalLiquidity);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, finalLiquidity);
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
        adminAccountNo,
        collateralToken,
        settlementToken,
        ethPoolId,
      } = await eightyTwentyRangeStrategyFixture();

      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 3n, 18), user0.address);

      await clearingHouse.updateRangeOrder(adminAccountNo, ethPoolId, {
        liquidityDelta: 10n ** 9n,
        tickLower: -220000,
        tickUpper: -170000,
        closeTokenPosition: false,
        sqrtPriceCurrent: 0,
        slippageToleranceBps: 0,
        limitOrderType: 0,
      });
      //Withdraw all shares
      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .redeem(parseTokenAmount(10n ** 3n, 18), user0.address, user0.address);

      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(0n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(0n, 18));
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 0n);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 0);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, 0n);

      //Initial loss due to precision errors
      await checkRealTokenBalances(
        clearingHouse,
        vaultAccountNo,
        collateralToken.address,
        settlementToken.address,
        parseTokenAmount(3n, 12),
        0n,
      );
    });
  });
  describe('#Scenarios', () => {
    it('Rebalance', async () => {
      const {
        eightyTwentyRangeStrategyVaultTest,
        clearingHouse,
        vaultAccountNo,
        settlementTokenTreasury,
        settlementToken,
        ethPoolId,
        ethPool,
        user0,
        trader0,
        trader0AccountNo,
      } = await eightyTwentyRangeStrategyFixture();

      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 6n, 18), user0.address);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 7895036065743972n);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065743972n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));

      await increaseBlockTimestamp(50000);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 7151872310113270000n, 0, false, false);

      // TODO: Fix the check - expected = -1811804020n
      // await checkAccountNetProfit(clearingHouse,vaultAccountNo,-1811821349n);

      const priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);
      await increaseBlockTimestamp(86400);
      await eightyTwentyRangeStrategyVaultTest.rebalance();
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -196670, -187730, 7895036065743972n);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -196670, -187730, 7895036065743972n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -7151872310113270000n - 2n);
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 998323869852538000000000n);
    });

    it('New Deposit', async () => {
      const {
        eightyTwentyRangeStrategyVaultTest,
        clearingHouse,
        vaultAccountNo,
        settlementTokenTreasury,
        settlementToken,
        ethPoolId,
        ethPool,
        user0,
        user1,
        trader0,
        trader0AccountNo,
      } = await eightyTwentyRangeStrategyFixture();

      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 6n, 18), user0.address);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 7895036065743972n);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065743972n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));

      await increaseBlockTimestamp(50000);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 7151872310113270000n, 0, false, false);
      // TODO: Fix the check - expected = -1811804020n
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -1811804020n);

      const priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(60000);
      await eightyTwentyRangeStrategyVaultTest.connect(user1).deposit(parseTokenAmount(10n ** 6n, 18), user1.address);

      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 1998323869852000000000000n);
      await checkTotalSupplyApproximate(eightyTwentyRangeStrategyVaultTest, 2001678944277120000000000n);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPositionApproximate(
        clearingHouse,
        vaultAccountNo,
        0,
        0,
        -197850,
        -188910,
        15803327457108200n,
      );
      await checkVaultRangeParamsApproximate(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 15803327457108200n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -7151872310113270000n - 2n);
    });

    it('Partial Withdraw', async () => {
      const {
        eightyTwentyRangeStrategyVaultTest,
        clearingHouse,
        vaultAccountNo,
        settlementTokenTreasury,
        settlementToken,
        ethPool,
        ethPoolId,
        user0,
        trader0,
        trader0AccountNo,
      } = await eightyTwentyRangeStrategyFixture();
      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 6n, 18), user0.address);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 7895036065743972n);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065743972n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));

      await increaseBlockTimestamp(50000);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 7151872310113270000n, 0, false, false);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -1811804020n);

      const priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(60000);

      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .withdraw(parseTokenAmount(5n * 10n ** 5n, 18), user0.address, user0.address);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 498323869852002000000000n);
      await checkTotalSupplyApproximate(eightyTwentyRangeStrategyVaultTest, 499160527861441000000000n);
      await checkLiquidityPositionApproximate(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 3940890370061880n);
      await checkVaultRangeParamsApproximate(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 3940890370061880n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -7151872310113270000n - 3n);
    });
  });
});
