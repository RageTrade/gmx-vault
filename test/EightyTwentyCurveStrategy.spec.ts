// Integration Testing New
import { parseTokenAmount, priceToPriceX128 } from '@ragetrade/sdk';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';

import addresses from './fixtures/addresses';
import { eightyTwentyCurveStrategyFixture } from './fixtures/eighty-twenty-curve-strategy';
import {
  checkAccountNetProfit,
  checkLiquidityPosition,
  checkLiquidityPositionApproximate,
  checkLiquidityPositionNum,
  checkNetTokenPosition,
  checkNetTokenPositionApproximate,
  logRageParams,
  swapToken,
} from './utils/rage-helpers';
import {
  checkTotalAssets,
  checkTotalAssetsApproximate,
  checkTotalSupply,
  checkTotalSupplyApproximate,
  checkVaultRangeParams,
  checkVaultRangeParamsApproximate,
  increaseBlockTimestamp,
  logVaultParams,
} from './utils/vault-helpers';

import { swapEth, swapUsdt, accrueFees } from './utils/curve-helper';

const within = (value: BigNumber, start: BigNumber, end: BigNumber): Boolean => {
  if (value.gte(start) && value.lte(end)) return true;
  return false;
};

describe('EightyTwentyCurveStrategy', () => {
  before(async () => {
    await eightyTwentyCurveStrategyFixture();
  });

  describe('No Price Movement', () => {
    it('Deposit - should transfer lp tokens & mint shares', async () => {
      const {
        gauge,
        lpToken,
        curveYieldStrategyTest: curveYieldStrategy,
        admin,
        user1,
        user2,
      } = await eightyTwentyCurveStrategyFixture();

      const amount1 = BigNumber.from(10).pow(18).mul(20);
      const amount2 = BigNumber.from(10).pow(18).mul(10);
      const amount = amount1.add(amount2);

      await curveYieldStrategy.connect(admin).updateDepositCap(amount);

      await lpToken.connect(user1).approve(curveYieldStrategy.address, amount1);
      await lpToken.connect(user2).approve(curveYieldStrategy.address, amount2);

      const [
        user1LpBalBefore,
        user2LpBalBefore,
        gaugeLpBalBefore,
        vaultLpBalBefore,
        user1SharesBalBefore,
        user2SharesBalBefore,
        totalAssetvalueBefore,
        totalSharesMintedBefore,
      ] = await Promise.all([
        lpToken.balanceOf(user1.address),
        lpToken.balanceOf(user2.address),
        lpToken.balanceOf(gauge.address),
        lpToken.balanceOf(curveYieldStrategy.address),
        curveYieldStrategy.balanceOf(user1.address),
        curveYieldStrategy.balanceOf(user2.address),
        curveYieldStrategy.totalSupply(),
        curveYieldStrategy.totalAssets(),
      ]);

      await curveYieldStrategy.connect(user1).deposit(amount1, user1.address);

      const [
        user1LpBalAfterFirstDeposit,
        user2LpBalAfterFirstDeposit,
        gaugeLpBalAfterFirstDeposit,
        vaultLpBalAfterFirstDeposit,
        user1SharesBalAfterFirstDeposit,
        user2SharesBalAfterFirstDeposit,
        totalAssetvalueAfterFirstDeposit,
        totalSharesMintedAfterFirstDeposit,
      ] = await Promise.all([
        lpToken.balanceOf(user1.address),
        lpToken.balanceOf(user2.address),
        lpToken.balanceOf(gauge.address),
        lpToken.balanceOf(curveYieldStrategy.address),
        curveYieldStrategy.balanceOf(user1.address),
        curveYieldStrategy.balanceOf(user2.address),
        curveYieldStrategy.totalSupply(),
        curveYieldStrategy.totalAssets(),
      ]);

      await hre.network.provider.send('evm_increaseTime', [1_000_000]);
      await hre.network.provider.send('evm_mine', []);

      await curveYieldStrategy.connect(user2).deposit(amount2, user2.address);

      const [
        user1LpBalAfterSecondDeposit,
        user2LpBalAfterSecondDeposit,
        gaugeLpBalAfterSecondDeposit,
        vaultLpBalAfterSecondDeposit,
        user1SharesBalAfterSecondDeposit,
        user2SharesBalAfterSecondDeposit,
        totalAssetvalueAfterSecondDeposit,
        totalSharesMintedAfterSecondDeposit,
      ] = await Promise.all([
        lpToken.balanceOf(user1.address),
        lpToken.balanceOf(user2.address),
        lpToken.balanceOf(gauge.address),
        lpToken.balanceOf(curveYieldStrategy.address),
        curveYieldStrategy.balanceOf(user1.address),
        curveYieldStrategy.balanceOf(user2.address),
        curveYieldStrategy.totalSupply(),
        curveYieldStrategy.totalAssets(),
      ]);

      expect(user1LpBalBefore).to.be.eq(amount1);
      expect(user2LpBalBefore).to.be.eq(amount2);

      expect(vaultLpBalBefore).to.be.eq(0);
      expect(gaugeLpBalBefore).to.be.gt(0);

      expect(user1SharesBalBefore).to.be.eq(0);
      expect(user2SharesBalBefore).to.be.eq(0);

      expect(totalAssetvalueBefore).to.be.eq(0);
      expect(totalSharesMintedBefore).to.be.eq(0);

      expect(user1LpBalBefore.sub(user1LpBalAfterFirstDeposit)).to.be.eq(user1LpBalBefore);
      expect(user2LpBalBefore.sub(user2LpBalAfterFirstDeposit)).to.be.eq(0);

      expect(vaultLpBalAfterFirstDeposit).to.be.eq(0);
      expect(gaugeLpBalAfterFirstDeposit).to.be.eq(gaugeLpBalBefore.add(amount1));

      expect(user1SharesBalAfterFirstDeposit).to.be.eq(amount1);
      expect(user2SharesBalAfterFirstDeposit).to.be.eq(0);

      expect(totalAssetvalueAfterFirstDeposit).to.be.eq(amount1);
      expect(totalSharesMintedAfterFirstDeposit).to.be.eq(amount1);

      expect(user1LpBalAfterFirstDeposit.sub(user1LpBalAfterSecondDeposit)).to.be.eq(0);
      expect(user2LpBalAfterFirstDeposit.sub(user2LpBalAfterSecondDeposit)).to.be.eq(amount2);

      expect(vaultLpBalAfterSecondDeposit).to.be.eq(0);
      expect(gaugeLpBalAfterSecondDeposit).to.be.eq(gaugeLpBalAfterFirstDeposit.add(amount2));

      expect(user1SharesBalAfterSecondDeposit).to.be.eq(amount1);
      expect(user2SharesBalAfterSecondDeposit).to.be.eq(amount2);

      expect(totalAssetvalueAfterSecondDeposit).to.be.eq(amount1.add(amount2));
      expect(totalSharesMintedAfterSecondDeposit).to.be.eq(amount1.add(amount2));
    });

    it('Withdraw - should pull LP from pool', async () => {
      const {
        gauge,
        lpToken,
        curveYieldStrategyTest: curveYieldStrategy,
        admin,
        user1,
        user2,
      } = await eightyTwentyCurveStrategyFixture();

      const amount1 = BigNumber.from(10).pow(18).mul(25);
      const amount2 = BigNumber.from(10).pow(18).mul(25);
      const amount = amount1.add(amount2);

      await curveYieldStrategy.connect(admin).updateDepositCap(amount);

      await lpToken.connect(user1).approve(curveYieldStrategy.address, amount1);
      await lpToken.connect(user2).approve(curveYieldStrategy.address, amount2);

      await curveYieldStrategy.connect(user1).deposit(amount1, user1.address);
      await hre.network.provider.send('evm_increaseTime', [1_000_000]);
      await hre.network.provider.send('evm_mine', []);

      await curveYieldStrategy.connect(user2).deposit(amount2, user2.address);
      await hre.network.provider.send('evm_increaseTime', [1_000_000]);
      await hre.network.provider.send('evm_mine', []);

      const [
        user1LpBalBefore,
        user2LpBalBefore,
        gaugeLpBalBefore,
        vaultLpBalBefore,
        user1SharesBalBefore,
        user2SharesBalBefore,
        totalAssetvalueBefore,
        totalSharesMintedBefore,
      ] = await Promise.all([
        lpToken.balanceOf(user1.address),
        lpToken.balanceOf(user2.address),
        lpToken.balanceOf(gauge.address),
        lpToken.balanceOf(curveYieldStrategy.address),
        curveYieldStrategy.balanceOf(user1.address),
        curveYieldStrategy.balanceOf(user2.address),
        curveYieldStrategy.totalAssets(),
        curveYieldStrategy.totalSupply(),
      ]);

      const pricePerShareBefore = totalAssetvalueBefore.div(totalSharesMintedBefore);

      const toWithdraw1 = await curveYieldStrategy.convertToAssets(user1SharesBalBefore);
      await curveYieldStrategy.connect(user1).withdraw(toWithdraw1, user1.address, user1.address);

      await hre.network.provider.send('evm_increaseTime', [1_000_000]);
      await hre.network.provider.send('evm_mine', []);

      const [
        user1LpBalAfterFirstWithdraw,
        user2LpBalAfterFirstWithdraw,
        gaugeLpBalAfterFirstWithdraw,
        vaultLpBalAfterFirstWithdraw,
        user1SharesBalAfterFirstWithdraw,
        user2SharesBalAfterFirstWithdraw,
        totalAssetvalueAfterFirstWithdraw,
        totalSharesMintedAfterFirstWithdraw,
      ] = await Promise.all([
        lpToken.balanceOf(user1.address),
        lpToken.balanceOf(user2.address),
        lpToken.balanceOf(gauge.address),
        lpToken.balanceOf(curveYieldStrategy.address),
        curveYieldStrategy.balanceOf(user1.address),
        curveYieldStrategy.balanceOf(user2.address),
        curveYieldStrategy.totalAssets(),
        curveYieldStrategy.totalSupply(),
      ]);

      const pricePerShareAfterFirstWithdraw = totalAssetvalueAfterFirstWithdraw.div(
        totalSharesMintedAfterFirstWithdraw,
      );

      const toWithdraw2 = await curveYieldStrategy.convertToAssets(user2SharesBalAfterFirstWithdraw);
      await curveYieldStrategy.connect(user2).withdraw(toWithdraw2, user2.address, user2.address);

      await hre.network.provider.send('evm_increaseTime', [1_000_000]);
      await hre.network.provider.send('evm_mine', []);

      const [
        user1LpBalAfterSecondWithdraw,
        user2LpBalAfterSecondWithdraw,
        gaugeLpBalAfterSecondWithdraw,
        vaultLpBalAfterSecondWithdraw,
        user1SharesBalAfterSecondWithdraw,
        user2SharesBalAfterSecondWithdraw,
        totalAssetvalueAfterSecondWithdraw,
        totalSharesMintedAfterSecondWithdraw,
      ] = await Promise.all([
        lpToken.balanceOf(user1.address),
        lpToken.balanceOf(user2.address),
        lpToken.balanceOf(gauge.address),
        lpToken.balanceOf(curveYieldStrategy.address),
        curveYieldStrategy.balanceOf(user1.address),
        curveYieldStrategy.balanceOf(user2.address),
        curveYieldStrategy.totalAssets(),
        curveYieldStrategy.totalSupply(),
      ]);

      const pricePerShareSecondWithdraw = totalAssetvalueAfterSecondWithdraw.div(totalSharesMintedAfterSecondWithdraw);

      expect(user1LpBalBefore).to.be.eq(0);
      expect(user2LpBalBefore).to.be.eq(0);

      expect(vaultLpBalBefore).to.be.eq(0);
      expect(gaugeLpBalBefore).to.be.gt(totalAssetvalueBefore);

      expect(user1SharesBalBefore).to.be.eq(amount1);
      expect(user2SharesBalBefore).to.be.eq(amount2);

      expect(totalAssetvalueBefore).to.be.gte(amount1.add(amount2));
      expect(totalSharesMintedBefore).to.be.eq(user1SharesBalBefore.add(user2SharesBalBefore));

      expect(user1LpBalAfterFirstWithdraw).to.be.eq(pricePerShareBefore.mul(user1SharesBalBefore));
      expect(user2LpBalAfterFirstWithdraw).to.be.eq(0);

      expect(vaultLpBalAfterFirstWithdraw).to.be.eq(0);
      expect(gaugeLpBalAfterFirstWithdraw).to.be.lt(gaugeLpBalBefore);

      const fraction1 = user1SharesBalBefore.mul(totalAssetvalueBefore).div(totalSharesMintedBefore);
      const shareFraction1 = await curveYieldStrategy.convertToShares(fraction1);

      expect(within(user1SharesBalAfterFirstWithdraw, BigNumber.from(0), user1SharesBalBefore.sub(shareFraction1))).to
        .be.true;
      expect(user2SharesBalAfterFirstWithdraw).to.be.eq(user2SharesBalBefore);

      expect(within(totalAssetvalueBefore.sub(totalAssetvalueAfterFirstWithdraw), BigNumber.from(0), shareFraction1)).to
        .be.true;

      expect(
        within(
          totalSharesMintedAfterFirstWithdraw.sub(user1SharesBalBefore),
          BigNumber.from(0),
          user1SharesBalBefore.sub(shareFraction1),
        ),
      ).to.be.true;

      const fraction2 = toWithdraw2.mul(totalAssetvalueAfterFirstWithdraw).div(totalSharesMintedAfterFirstWithdraw);
      const shareFraction2 = await curveYieldStrategy.convertToShares(fraction2);

      expect(user1LpBalAfterSecondWithdraw).to.be.eq(user1LpBalAfterFirstWithdraw);
      expect(user2LpBalAfterSecondWithdraw).to.be.eq(toWithdraw2);

      expect(vaultLpBalAfterSecondWithdraw).to.be.eq(0);
      expect(gaugeLpBalAfterSecondWithdraw).to.be.lt(gaugeLpBalAfterFirstWithdraw);

      expect(user1SharesBalAfterSecondWithdraw).to.be.eq(user1SharesBalAfterFirstWithdraw);
      expect(
        within(
          user2SharesBalAfterSecondWithdraw,
          BigNumber.from(0),
          shareFraction2.sub(user2SharesBalAfterFirstWithdraw),
        ),
      ).to.be.true;

      expect(totalAssetvalueAfterSecondWithdraw).to.be.eq(
        totalAssetvalueAfterFirstWithdraw.sub(user2LpBalAfterSecondWithdraw),
      );
      expect(
        within(
          totalSharesMintedAfterSecondWithdraw,
          BigNumber.from(0),
          shareFraction2.sub(user2SharesBalAfterFirstWithdraw),
        ),
      ).to.be.true;
    });
  });
  describe('#Scenarios', () => {
    it('Rebalance', async () => {
      const {
        curveYieldStrategyTest: curveYieldStrategy,
        clearingHouse,
        vaultAccountNo,
        lpToken,
        settlementToken,
        ethPoolId,
        ethPool,
        weth,
        crv,
        usdt,
        uniswapQuoter,
        gauge,
        user1,
        trader0,
        lpOracle,
        triCrypto,
        trader0AccountNo,
      } = await eightyTwentyCurveStrategyFixture();

      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 131437400051827n);
      await checkVaultRangeParams(curveYieldStrategy, -197850, -188910, 131437400051827n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));
      await increaseBlockTimestamp(50000);

      // await logVaultParams('Initial Deposit - user1', curveYieldStrategy);
      // await logRageParams('Initial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      console.log('before swap');
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 119065130813353000n, 0, false, false);

      //   const priceX128 = await priceToPriceX128(1665.658746887488043886, 6, 18);
      //   await curveYieldStrategy.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(1_000_000);
      await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      await accrueFees(
        curveYieldStrategy.address,
        gauge,
        crv,
        usdt,
        curveYieldStrategy,
        triCrypto,
        uniswapQuoter,
        lpToken,
      );

      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -30163108n);
      await curveYieldStrategy.rebalance();
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -196670, -187730, 131437400051827n);
      await checkVaultRangeParams(curveYieldStrategy, -196670, -187730, 131437400051827n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -119065130813353002n);
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalAssetsApproximate(curveYieldStrategy, 9989164108343610000n);

      // await logVaultParams('Rebalance', curveYieldStrategy);
      // await logRageParams('Rebalance', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
    });

    it('New Deposit', async () => {
      const {
        curveYieldStrategyTest: curveYieldStrategy,
        clearingHouse,
        vaultAccountNo,
        lpToken,
        settlementToken,
        ethPoolId,
        ethPool,
        weth,
        crv,
        usdt,
        uniswapQuoter,
        gauge,
        user1,
        trader0,
        lpOracle,
        triCrypto,
        trader0AccountNo,
      } = await eightyTwentyCurveStrategyFixture();

      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 131437400051827n);
      await checkVaultRangeParams(curveYieldStrategy, -197850, -188910, 131437400051827n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));
      await increaseBlockTimestamp(50000);

      // await logVaultParams('Initial Deposit - user1', curveYieldStrategy);
      // await logRageParams('Initial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      console.log('before swap');
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 119065130813353000n, 0, false, false);

      //   const priceX128 = await priceToPriceX128(1665.658746887488043886, 6, 18);
      //   await curveYieldStrategy.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(1_000_000);
      await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      await accrueFees(
        curveYieldStrategy.address,
        gauge,
        crv,
        usdt,
        curveYieldStrategy,
        triCrypto,
        uniswapQuoter,
        lpToken,
      );
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -30163108n);

      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await checkTotalAssetsApproximate(curveYieldStrategy, 19989164205961000000n);
      await checkTotalSupplyApproximate(curveYieldStrategy, 20010847548218700000n);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPositionApproximate(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 263017376982064n);
      await checkVaultRangeParamsApproximate(curveYieldStrategy, -197850, -188910, 263017376982064n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -119065130813353001n);
      // await logVaultParams('Deposit', curveYieldStrategy);
      // await logRageParams('Deposit', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
    });

    it('Partial Withdraw', async () => {
      const {
        curveYieldStrategyTest: curveYieldStrategy,
        clearingHouse,
        vaultAccountNo,
        lpToken,
        settlementToken,
        ethPoolId,
        ethPool,
        weth,
        crv,
        usdt,
        uniswapQuoter,
        gauge,
        user1,
        trader0,
        lpOracle,
        triCrypto,
        trader0AccountNo,
      } = await eightyTwentyCurveStrategyFixture();

      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 131437400051827n);
      await checkVaultRangeParams(curveYieldStrategy, -197850, -188910, 131437400051827n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));
      await increaseBlockTimestamp(50000);

      // await logVaultParams('Initial Deposit - user1', curveYieldStrategy);
      // await logRageParams('Initial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      console.log('before swap');
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 119065130813353000n, 0, false, false);

      //   const priceX128 = await priceToPriceX128(1665.658746887488043886, 6, 18);
      //   await curveYieldStrategy.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(1_000_000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -30163108n);

      await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      await accrueFees(
        curveYieldStrategy.address,
        gauge,
        crv,
        usdt,
        curveYieldStrategy,
        triCrypto,
        uniswapQuoter,
        lpToken,
      );

      await curveYieldStrategy.connect(user1).withdraw(parseTokenAmount(5n, 18), user1.address, user1.address);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkTotalAssetsApproximate(curveYieldStrategy, 4989164205961090000n);
      await checkTotalSupplyApproximate(curveYieldStrategy, 4994576225890620000n);
      await checkLiquidityPositionApproximate(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 65647411349174n);
      await checkVaultRangeParamsApproximate(curveYieldStrategy, -197850, -188910, 65647411349174n);
      // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -59467986586889700n);
      // await logVaultParams('Withdraw', curveYieldStrategy);
      // await logRageParams('Withdraw', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
    });

    it('EndToEnd Scenario - Multiple Deposits & Withdrawals', async () => {
      const {
        curveYieldStrategyTest: curveYieldStrategy,
        clearingHouse,
        vaultAccountNo,
        lpToken,
        settlementToken,
        ethPoolId,
        ethPool,
        weth,
        crv,
        usdt,
        uniswapQuoter,
        gauge,
        user1,
        user2,
        trader0,
        lpOracle,
        triCrypto,
        trader0AccountNo,
      } = await eightyTwentyCurveStrategyFixture();

      // Initial Deposit - user1
      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await logVaultParams('Initial Deposit - user1', curveYieldStrategy);
      await logRageParams('Initial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 131437400051827n);
      await checkVaultRangeParams(curveYieldStrategy, -197850, -188910, 131437400051827n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 119065130813353000n, 0, false, false);
      // TODO: Fix the check - expected = -1811804020n
      // await checkAccountNetProfit(clearingHouse,vaultAccountNo,-1811821349n);
      await increaseBlockTimestamp(20_000);
      await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      await accrueFees(
        curveYieldStrategy.address,
        gauge,
        crv,
        usdt,
        curveYieldStrategy,
        triCrypto,
        uniswapQuoter,
        lpToken,
      );
      // let priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      // await curveYieldStrategy.setYieldTokenPriceX128(priceX128);

      // Initial Deposit - user2
      await increaseBlockTimestamp(10000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -30163108n);
      await curveYieldStrategy.connect(user2).deposit(parseTokenAmount(10n, 18), user2.address);
      await logVaultParams('Initial Deposit - user2', curveYieldStrategy);
      await logRageParams('Initial Deposit - user2', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkTotalAssetsApproximate(curveYieldStrategy, 19989164205961000000n);
      await checkTotalSupplyApproximate(curveYieldStrategy, 20010847548218700000n);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPositionApproximate(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 263017376982064n);
      await checkVaultRangeParamsApproximate(curveYieldStrategy, -197850, -188910, 263017376982064n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -119065130813353001n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4998.91817108492, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 200508852251313000n, 0, false, false);
      // priceX128 = await priceToPriceX128(1.1585067916761, 6, 18);
      // // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      // await curveYieldStrategy.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(20_000);
      await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      await accrueFees(
        curveYieldStrategy.address,
        gauge,
        crv,
        usdt,
        curveYieldStrategy,
        triCrypto,
        uniswapQuoter,
        lpToken,
      );

      // Partial Deposit - user1
      await increaseBlockTimestamp(10000);
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, 0n);
      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await logVaultParams('Partial Deposit - user1', curveYieldStrategy);
      await logRageParams('Partial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      // await checkTotalAssetsApproximate(curveYieldStrategy, 24989164108343600000n);
      // await checkTotalSupplyApproximate(curveYieldStrategy, 25016271469072200000n);
      // await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      // await checkLiquidityPositionApproximate(
      //   clearingHouse,
      //   vaultAccountNo,
      //   0,
      //   0,
      //   -197850,
      //   -188910,
      //   328807368088555n,
      // );
      // await checkVaultRangeParamsApproximate(curveYieldStrategy, -197850, -188910, 328807368088555n);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -319573983064666000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(5608.12126809528, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 259850846990561000n, 0, false, false);
      // priceX128 = await priceToPriceX128(1.24985573493289, 6, 18);
      // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      // await curveYieldStrategy.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(20_000);
      await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      await accrueFees(
        curveYieldStrategy.address,
        gauge,
        crv,
        usdt,
        curveYieldStrategy,
        triCrypto,
        uniswapQuoter,
        lpToken,
      );

      // 24hr Rebalance
      await increaseBlockTimestamp(36400);
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, 0n);
      await curveYieldStrategy.rebalance();

      await logVaultParams('24hr Rebalance', curveYieldStrategy);
      await logRageParams('24hr Rebalance', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      // await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      // await checkLiquidityPositionApproximate(
      //   clearingHouse,
      //   vaultAccountNo,
      //   0,
      //   0,
      //   -194470,
      //   -185530,
      //   328807368088555n,
      // );
      // await checkVaultRangeParamsApproximate(curveYieldStrategy, -194470, -185530, 328807368088555n);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -579424830055227000n);
      // await checkTotalAssetsApproximate(curveYieldStrategy, 24989164108343600000n);
      // await checkTotalSupplyApproximate(curveYieldStrategy, 25016271469072200000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4998.91817108492, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -259850846990561000n, 0, false, false);

      await increaseBlockTimestamp(20_000);
      await swapUsdt(25000n, trader0.address, usdt, triCrypto, lpOracle);
      await accrueFees(
        curveYieldStrategy.address,
        gauge,
        crv,
        usdt,
        curveYieldStrategy,
        triCrypto,
        uniswapQuoter,
        lpToken,
      );
      // priceX128 = await priceToPriceX128(1.1585067916761, 6, 18);
      // // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      // await curveYieldStrategy.setYieldTokenPriceX128(priceX128);

      // Partial Withdraw - user1
      await increaseBlockTimestamp(10000);
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, 0n);
      await curveYieldStrategy.connect(user1).withdraw(parseTokenAmount(5n, 18), user1.address, user1.address);

      await logVaultParams('Partial Withdraw - user1', curveYieldStrategy);
      await logRageParams('Partial Withdraw - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      // await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      // await checkLiquidityPositionApproximate(
      //   clearingHouse,
      //   vaultAccountNo,
      //   0,
      //   0,
      //   -194470,
      //   -185530,
      //   263017378742979n,
      // );
      // await checkVaultRangeParamsApproximate(curveYieldStrategy, -194470, -185530, 263017378742979n);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -255631471486627000n);
      // await checkTotalAssetsApproximate(curveYieldStrategy, 19989164108343600000n);
      // await checkTotalSupplyApproximate(curveYieldStrategy, 20010847646048100000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4819.27428340935, 6, 18));
      //Arb1 - trader0 : Arb to close user1 withdrawn position
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -171229974338125000n, 0, false, false);

      await increaseBlockTimestamp(20_000);
      await swapUsdt(25000n, trader0.address, usdt, triCrypto, lpOracle);
      await accrueFees(
        curveYieldStrategy.address,
        gauge,
        crv,
        usdt,
        curveYieldStrategy,
        triCrypto,
        uniswapQuoter,
        lpToken,
      );

      // priceX128 = await priceToPriceX128(1.13085856364611, 6, 18);
      // // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      // await curveYieldStrategy.setYieldTokenPriceX128(priceX128);

      // Partial Withdraw - user2
      await increaseBlockTimestamp(10000);
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, 0n);
      await curveYieldStrategy.connect(user2).withdraw(parseTokenAmount(5n, 18), user2.address, user2.address);

      await logVaultParams('Partial Withdraw - user2', curveYieldStrategy);
      await logRageParams('Partial Withdraw - user2', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      // await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      // await checkLiquidityPositionApproximate(clearingHouse, vaultAccountNo, 0, 0, -194470, -185530, 197227389397403n);
      // await checkVaultRangeParamsApproximate(curveYieldStrategy, -194470, -185530, 197227389397403n);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -191688959908585000n);
      // await checkTotalAssetsApproximate(curveYieldStrategy, 14989164108343600000n);
      // await checkTotalSupplyApproximate(curveYieldStrategy, 15005423823024100000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4819.27428340935, 6, 18));
      //Arb2 - trader0 : Arb to close user2 withdrawn position
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -3843728083914130000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -7648989783509370000n);
    });

    // Reset Code
    // Reset Code
    it('Reset', async () => {
      const {
        curveYieldStrategyTest: curveYieldStrategy,
        clearingHouse,
        vaultAccountNo,
        lpToken,
        settlementToken,
        ethPoolId,
        ethPool,
        weth,
        crv,
        usdt,
        uniswapQuoter,
        gauge,
        user1,
        user2,
        trader0,
        lpOracle,
        triCrypto,
        trader0AccountNo,
      } = await eightyTwentyCurveStrategyFixture();

      let priceX128;
      // Initial Deposit - user1
      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await logVaultParams('Initial Deposit - user1', curveYieldStrategy);
      await logRageParams('Initial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      // await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      // await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 131437400051827n);
      // await checkVaultRangeParams(curveYieldStrategy, -197850, -188910, 131437400051827n);
      // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      // await checkTotalAssets(curveYieldStrategy, parseTokenAmount(10n, 18));
      // await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));

      //Swap1 - trader0
      await increaseBlockTimestamp(50000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(6197.90154302086, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 408732660730720000n, 0, false, false);

      await increaseBlockTimestamp(50_000);
      await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      await accrueFees(
        curveYieldStrategy.address,
        gauge,
        crv,
        usdt,
        curveYieldStrategy,
        triCrypto,
        uniswapQuoter,
        lpToken,
      );
      // priceX128 = await priceToPriceX128(1.33512488303275, 6, 18);
      // await curveYieldStrategy.setYieldTokenPriceX128(priceX128);

      await logVaultParams('Swap1 - trader0', curveYieldStrategy);
      await logRageParams('Swap1 - trader0', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      // Rebalance
      await increaseBlockTimestamp(86400);
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, 0n);
      await curveYieldStrategy.rebalance();
      await logVaultParams('Rebalance', curveYieldStrategy);
      await logRageParams('Rebalance', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      // await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      // await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -193470, -184530, 131437400051827n);
      // await checkVaultRangeParams(curveYieldStrategy, -193470, -184530, 131437400051827n);
      // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -408732660730720000n);
      // await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));
      // await checkTotalAssetsApproximate(curveYieldStrategy, 9702386578606810000n);

      //Swap2 - trader0
      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 300570636197446000n, 0, false, false);

      await increaseBlockTimestamp(50_000);
      await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      await accrueFees(
        curveYieldStrategy.address,
        gauge,
        crv,
        usdt,
        curveYieldStrategy,
        triCrypto,
        uniswapQuoter,
        lpToken,
      );
      // priceX128 = await priceToPriceX128(1.6274509127026, 6, 18);
      // await curveYieldStrategy.setYieldTokenPriceX128(priceX128);
      await logVaultParams('Swap2 - trader0', curveYieldStrategy);
      await logRageParams('Swap2 - trader0', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Reset
      await increaseBlockTimestamp(10000);
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, 0n);
      await curveYieldStrategy.rebalance();
      await logVaultParams('Reset', curveYieldStrategy);
      await logRageParams('Reset', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      // await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      // await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -190470, -181530, 162175424743904n);
      // await checkVaultRangeParams(curveYieldStrategy, -190470, -181530, 162175424743904n);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -709303296928166000n);
      // await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));
      // await checkTotalAssetsApproximate(curveYieldStrategy, 9702386578606810000n);

      //Arb1 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));

      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -81540303747114700n, 0, false, false);
      await logVaultParams('ClosePositon 1 Before', curveYieldStrategy);
      await logRageParams('ClosePositon 1 Before', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -627762993181052000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 1 After', curveYieldStrategy);
      await logRageParams('ClosePositon 1 After', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb2 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -81540303747114700n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -546222689433938000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 2', curveYieldStrategy);
      await logRageParams('ClosePositon 2', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      //Arb3 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -81540303747114700n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -464682385686823000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 3', curveYieldStrategy);
      await logRageParams('ClosePositon 3', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      //Arb4 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -81540303747114700n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -383142081939708000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 4', curveYieldStrategy);
      await logRageParams('ClosePositon 4', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      //Arb5 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -81540303747114700n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -301601778192594000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 5', curveYieldStrategy);
      await logRageParams('ClosePositon 5', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      //Arb6 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -81540303747114700n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -220061474445479000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 6', curveYieldStrategy);
      await logRageParams('ClosePositon 6', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      //Arb7 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -81540303747114700n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -138521170698364000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();

      //Arb8 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -81540303747114700n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -56980866951249400n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();

      //Arb9 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -56980866951249400n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, 0);
      // expect(await curveYieldStrategy.isReset()).to.be.false;
      // await expect(curveYieldStrategy.closeTokenPosition()).to.be.revertedWith('ETRS_INVALID_CLOSE');
    });
    it('Slippage Threshold - Partial Withdraw', async () => {
      const {
        curveYieldStrategyTest: curveYieldStrategy,
        clearingHouse,
        vaultAccountNo,
        lpToken,
        settlementToken,
        ethPoolId,
        ethPool,
        weth,
        crv,
        usdt,
        uniswapQuoter,
        gauge,
        user1,
        user2,
        trader0,
        lpOracle,
        triCrypto,
        trader0AccountNo,
      } = await eightyTwentyCurveStrategyFixture();
      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 131437400051827n);
      await checkVaultRangeParams(curveYieldStrategy, -197850, -188910, 131437400051827n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));

      // await logVaultParams("Deposit - user2",curveYieldStrategy);
      // await logRageParams("Deposit - user2",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await increaseBlockTimestamp(10000);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 119065130813353000n, 0, false, false);

      await increaseBlockTimestamp(1_000_000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -30163108n);

      await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      await accrueFees(
        curveYieldStrategy.address,
        gauge,
        crv,
        usdt,
        curveYieldStrategy,
        triCrypto,
        uniswapQuoter,
        lpToken,
      );

      // const priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      // await curveYieldStrategy.setYieldTokenPriceX128(priceX128);

      // await logVaultParams("Swap1 - trader0",curveYieldStrategy);
      // await logRageParams("Swap1 - trader0",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await increaseBlockTimestamp(10000);

      await curveYieldStrategy.connect(user1).withdraw(parseTokenAmount(8n, 18), user1.address, user1.address);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkTotalAssetsApproximate(curveYieldStrategy, 2167358348789560000n);
      await checkTotalSupplyApproximate(curveYieldStrategy, 2169709422412270000n);
      await checkLiquidityPositionApproximate(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 28518096536276n);
      await checkVaultRangeParamsApproximate(curveYieldStrategy, -197850, -188910, 28518096536276n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -119065130813353000n);

      // await logVaultParams("Withdraw - user2",curveYieldStrategy);
      // await logRageParams("Withdraw - user2",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await increaseBlockTimestamp(10000);

      //Arb1 - trader0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4961.56838901073, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -93262698100728065n, 0, false, false);
      await increaseBlockTimestamp(10000);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -25802432712625000n);
      // await logVaultParams("Arb1 - trader0",curveYieldStrategy);
      // await logRageParams("Arb1 - trader0",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);
    });
  });
  describe('Protocol Fee Withdrawal', () => {
    it('should deduct rage fee (10% which can be changed)', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest, triCrypto } = await eightyTwentyCurveStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(admin);

      await curveYieldStrategy.withdrawFees();
    });
  });
});
