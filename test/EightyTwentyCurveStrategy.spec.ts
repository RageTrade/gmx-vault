// Integration Testing New
import { parseTokenAmount, priceToPriceX128 } from '@ragetrade/sdk';
import { expect } from 'chai';
import { BigNumber, providers } from 'ethers';
import hre, { ethers } from 'hardhat';

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
import { activateMainnetFork, deactivateMainnetFork } from './utils/mainnet-fork';

const within = (value: BigNumber, start: BigNumber, end: BigNumber): Boolean => {
  if (value.gte(start) && value.lte(end)) return true;
  return false;
};

describe('EightyTwentyCurveStrategy', () => {
  before(async () => {
    await activateMainnetFork({ blockNumber: 9323800 });
    await eightyTwentyCurveStrategyFixture();
  });

  after(async () => {
    await deactivateMainnetFork();
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
        clearingHouseLens,
      } = await eightyTwentyCurveStrategyFixture();

      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      // console.log('protocolInfo', await clearingHouseLens.getProtocolInfo())

      // console.log('vPool', await clearingHouseLens.getVPool(ethPoolId));
      // console.log('CH', await clearingHouseLens.clearingHouse(), clearingHouse.address, ethPool.vToken.address);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
      await checkVaultRangeParams(curveYieldStrategy, -197850, -188910, 131437400051827n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));
      await increaseBlockTimestamp(50000);

      // await logVaultParams('Initial Deposit - user1', curveYieldStrategy);
      // await logRageParams('Initial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      // console.log('before swap');
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
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -196670, -187730, 131437400051827n);
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
        clearingHouseLens,
      } = await eightyTwentyCurveStrategyFixture();

      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
      await checkVaultRangeParams(curveYieldStrategy, -197850, -188910, 131437400051827n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));
      await increaseBlockTimestamp(50000);

      // await logVaultParams('Initial Deposit - user1', curveYieldStrategy);
      // await logRageParams('Initial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      // console.log('before swap');
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
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        263017376982064n,
      );
      await checkVaultRangeParamsApproximate(curveYieldStrategy, -197850, -188910, 263017376982064n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -119065130813353001n);
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
        clearingHouseLens,
      } = await eightyTwentyCurveStrategyFixture();

      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
      await checkVaultRangeParams(curveYieldStrategy, -197850, -188910, 131437400051827n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));
      await increaseBlockTimestamp(50000);

      // await logVaultParams('Initial Deposit - user1', curveYieldStrategy);
      // await logRageParams('Initial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      // console.log('before swap');
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
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkTotalAssetsApproximate(curveYieldStrategy, 4989164205961090000n);
      await checkTotalSupplyApproximate(curveYieldStrategy, 4994576225890620000n);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        65647411349174n,
      );
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
        clearingHouseLens,
      } = await eightyTwentyCurveStrategyFixture();

      // Initial Deposit - user1
      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      // await logVaultParams('Initial Deposit - user1', curveYieldStrategy);
      // await logRageParams('Initial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
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
      // console.log('BLOCK before increase', (await hre.ethers.provider.getBlockNumber()))
      await increaseBlockTimestamp(10000);
      // console.log('BLOCK after increase', (await hre.ethers.provider.getBlockNumber()))
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -30124931n);
      await curveYieldStrategy.connect(user2).deposit(parseTokenAmount(10n, 18), user2.address);
      // console.log('BLOCK after deposit', (await hre.ethers.provider.getBlockNumber()))
      // await logVaultParams('Initial Deposit - user2', curveYieldStrategy);
      // await logRageParams('Initial Deposit - user2', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkTotalAssetsApproximate(curveYieldStrategy, 19983017869055200000n);
      await checkTotalSupplyApproximate(curveYieldStrategy, 20017011019280500000n);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        263098388518300n,
      );
      await checkVaultRangeParamsApproximate(curveYieldStrategy, -197850, -188910, 263098388518300n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -119065130813353002n);

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
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -103336910n);
      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      // await logVaultParams('Partial Deposit - user1', curveYieldStrategy);
      // await logRageParams('Partial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkTotalAssetsApproximate(curveYieldStrategy, 29915383101766919557n);
      await checkTotalSupplyApproximate(curveYieldStrategy, 30068004388932400000n);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        395206032162820n,
      );
      await checkVaultRangeParamsApproximate(curveYieldStrategy, -197850, -188910, 395206032162820n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -319573983064666000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(5498.17799411523, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 259790609567501000n, 0, false, false);
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
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -207756819n);
      await curveYieldStrategy.rebalance();

      // await logVaultParams('24hr Rebalance', curveYieldStrategy);
      // await logRageParams('24hr Rebalance', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -194670,
        -185730,
        395206032162820n,
      );
      await checkVaultRangeParamsApproximate(curveYieldStrategy, -194670, -185730, 395206032162820n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -579364592632167000n);
      await checkTotalAssetsApproximate(curveYieldStrategy, 29772973774275100000n);
      await checkTotalSupplyApproximate(curveYieldStrategy, 30068004388932400000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4998.91817108492, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -259790609567501000n, 0, false, false);

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
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, 190339458n);
      await curveYieldStrategy.connect(user1).withdraw(parseTokenAmount(5n, 18), user1.address, user1.address);

      // await logVaultParams('Partial Withdraw - user1', curveYieldStrategy);
      // await logRageParams('Partial Withdraw - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -194670,
        -185730,
        329197171926419n,
      );
      await checkVaultRangeParamsApproximate(curveYieldStrategy, -194670, -185730, 329197171926419n);
      await checkTotalAssetsApproximate(curveYieldStrategy, 24935832155520300000n);
      await checkTotalSupplyApproximate(curveYieldStrategy, 25045928464547600000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4979.95927467972, 6, 18));
      //Arb1 - trader0 : Arb to close user1 withdrawn position
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -53406247782040200n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -266167735282626000n);

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
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, 20498698n);
      await curveYieldStrategy.connect(user2).withdraw(parseTokenAmount(5n, 18), user2.address, user2.address);

      // await logVaultParams('Partial Withdraw - user2', curveYieldStrategy);
      // await logRageParams('Partial Withdraw - user2', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -194670,
        -185730,
        263203417213376n,
      );
      await checkVaultRangeParamsApproximate(curveYieldStrategy, -194670, -185730, 263203417213376n);
      await checkTotalAssetsApproximate(curveYieldStrategy, 19941605019687500000n);
      await checkTotalSupplyApproximate(curveYieldStrategy, 20025014925748100000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4951.48786057211, 6, 18));
      //Arb2 - trader0 : Arb to close user2 withdrawn position
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -53377188544524200n, 0, false, false);

      // await logVaultParams('Arb2', curveYieldStrategy);
      // await logRageParams('Arb2', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -212790546738102000n);
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
        clearingHouseLens,
      } = await eightyTwentyCurveStrategyFixture();

      let priceX128;
      // Initial Deposit - user1
      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      // await logVaultParams('Initial Deposit - user1', curveYieldStrategy);
      // await logRageParams('Initial Deposit - user1', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
      await checkVaultRangeParams(curveYieldStrategy, -197850, -188910, 131437400051827n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));

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

      // await logVaultParams('Swap1 - trader0', curveYieldStrategy);
      // await logRageParams('Swap1 - trader0', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      // Rebalance
      await increaseBlockTimestamp(86400);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -496043715n);
      await curveYieldStrategy.rebalance();
      // await logVaultParams('Rebalance', curveYieldStrategy);
      // await logRageParams('Rebalance', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -193470, -184530, 131437400051827n);
      await checkVaultRangeParams(curveYieldStrategy, -193470, -184530, 131437400051827n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -408732660730720003n);
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalAssetsApproximate(curveYieldStrategy, 9705559012921618351n);

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
      // await logVaultParams('Swap2 - trader0', curveYieldStrategy);
      // await logRageParams('Swap2 - trader0', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Reset
      await increaseBlockTimestamp(10000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -1827617093n);
      await curveYieldStrategy.rebalance();
      // await logVaultParams('Reset', curveYieldStrategy);
      // await logRageParams('Reset', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -189500,
        -180560,
        74299620029031n,
      );
      await checkVaultRangeParamsApproximate(curveYieldStrategy, -189500, -180560, 74299622540873n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -709303296928167000n);
      await checkTotalSupply(curveYieldStrategy, parseTokenAmount(10n, 18));
      await checkTotalAssetsApproximate(curveYieldStrategy, 8604947648817179279n);

      //Arb1 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));

      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await logVaultParams('ClosePositon 1 Before', curveYieldStrategy);
      // await logRageParams('ClosePositon 1 Before', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -671993974032319518n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 1 After', curveYieldStrategy);
      // await logRageParams('ClosePositon 1 After', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb2 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -634679748203374520n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 2', curveYieldStrategy);
      // await logRageParams('ClosePositon 2', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      //Arb3 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -597365522374429522n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 3', curveYieldStrategy);
      // await logRageParams('ClosePositon 3', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      //Arb4 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -560051296545484524n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 4', curveYieldStrategy);
      // await logRageParams('ClosePositon 4', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      //Arb5 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -522737070716539526n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 5', curveYieldStrategy);
      // await logRageParams('ClosePositon 5', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      //Arb6 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -485422844887594528n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 6', curveYieldStrategy);
      // await logRageParams('ClosePositon 6', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
      //Arb7 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -448108619058649530n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 7', curveYieldStrategy);
      // await logRageParams('ClosePositon 7', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb8 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -410794393229704532n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 8', curveYieldStrategy);
      // await logRageParams('ClosePositon 8', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb9 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -373480167400759534n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 9', curveYieldStrategy);
      // await logRageParams('ClosePositon 9', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb10 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -336165941571814536n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 10', curveYieldStrategy);
      // await logRageParams('ClosePositon 10', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb11 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -298851715742869538n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 11', curveYieldStrategy);
      // await logRageParams('ClosePositon 11', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb12 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -261537489913924540n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 12', curveYieldStrategy);
      // await logRageParams('ClosePositon 12', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb13 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -224223264084979542n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 13', curveYieldStrategy);
      // await logRageParams('ClosePositon 13', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb14 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -186909038256034544n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 14', curveYieldStrategy);
      // await logRageParams('ClosePositon 14', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb15 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -149594812427089546n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 15', curveYieldStrategy);
      // await logRageParams('ClosePositon 15', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb16 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -112280586598144548n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 16', curveYieldStrategy);
      // await logRageParams('ClosePositon 16', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb17 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -74966360769199550n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 17', curveYieldStrategy);
      // await logRageParams('ClosePositon 17', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb18 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -37652134940254552n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await curveYieldStrategy.closeTokenPosition();
      // await logVaultParams('ClosePositon 18', curveYieldStrategy);
      // await logRageParams('ClosePositon 18', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);

      //Arb19 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -337909111309554n);
      //ClosePositon
      //   await increaseBlockTimestamp(10000);
      //   await curveYieldStrategy.closeTokenPosition();
      //   await logVaultParams('ClosePositon 19', curveYieldStrategy);
      //   await logRageParams('ClosePositon 19', clearingHouse, ethPool.vPool, vaultAccountNo, 0, 0);
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
        clearingHouseLens,
      } = await eightyTwentyCurveStrategyFixture();
      await curveYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
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
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkTotalAssetsApproximate(curveYieldStrategy, 2167358348789560000n);
      await checkTotalSupplyApproximate(curveYieldStrategy, 2169709422412270000n);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        28518096536276n,
      );
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
