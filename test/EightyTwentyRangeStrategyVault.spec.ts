import { expect } from 'chai';
import { BigNumber, ethers } from 'ethers';
import hre from 'hardhat';

import { parseTokenAmount, priceToPriceX128 } from '@ragetrade/sdk';

import { eightyTwentyRangeStrategyFixture } from './fixtures/eighty-twenty-range-strategy-vault';
import {
  checkAccountNetProfit,
  checkLiquidityPosition,
  checkLiquidityPositionApproximate,
  checkLiquidityPositionNum,
  checkNetTokenPosition,
  checkNetTokenPositionApproximate,
  checkRealTokenBalances,
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
} from './utils/vault-helpers';
import { activateMainnetFork, deactivateMainnetFork } from './utils/mainnet-fork';

describe('EightyTwentyRangeStrategyVault', () => {
  before(async () => {
    // deploys contracts once
    await activateMainnetFork({ blockNumber: 9323800 });
    await eightyTwentyRangeStrategyFixture();
  });

  after(async () => {
    // deploys contracts once
    await deactivateMainnetFork();
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
        clearingHouseLens,
      } = await eightyTwentyRangeStrategyFixture();

      // console.log('vPool', await clearingHouseLens.getVPool(ethPoolId));
      // console.log('CH', await clearingHouseLens.clearingHouse(), clearingHouse.address, ethPool.vToken.address);

      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 3n, 18), user0.address);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 3n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 3n, 18));
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036057856n);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 7895036057856n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);

      //Collateral Token Balance 1e-6 USD lesser due to round down in market value calculation
      await checkRealTokenBalances(
        clearingHouseLens,
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

      await eightyTwentyRangeStrategyVaultTest.updateBaseParams(
        parseTokenAmount(1, 18),
        ethers.constants.AddressZero,
        0,
        0,
      );
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
        clearingHouseLens,
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

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, finalLiquidity);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);

      //Initial loss due to precision errors
      await checkRealTokenBalances(
        clearingHouseLens,
        vaultAccountNo,
        collateralToken.address,
        settlementToken.address,
        parseTokenAmount(900n, 18).sub(parseTokenAmount(3n, 12)),
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
        clearingHouseLens,
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
        settleProfit: false,
      });
      //Withdraw all shares
      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .redeem(parseTokenAmount(10n ** 3n, 18), user0.address, user0.address);

      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(0n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(0n, 18));
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 0n);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 0);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, 0n);

      await checkRealTokenBalances(
        clearingHouseLens,
        vaultAccountNo,
        collateralToken.address,
        settlementToken.address,
        0n,
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
        clearingHouseLens,
      } = await eightyTwentyRangeStrategyFixture();

      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 6n, 18), user0.address);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        7895036065743972n,
      );
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065743972n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));

      await increaseBlockTimestamp(50000);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 7151872310113270000n, 0, false, false);

      // TODO: Fix the check - expected = -1811804020n

      const priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);
      await increaseBlockTimestamp(86400);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -1811804019n);
      await eightyTwentyRangeStrategyVaultTest.rebalance();
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -196670,
        -187730,
        7895036065743972n,
      );
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
        clearingHouseLens,
      } = await eightyTwentyRangeStrategyFixture();

      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 6n, 18), user0.address);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        7895036065743972n,
      );
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065743972n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));

      await increaseBlockTimestamp(50000);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 7151872310113270000n, 0, false, false);
      // TODO: Fix the check - expected = -1811804020n

      const priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(60000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -1811804019n);

      await eightyTwentyRangeStrategyVaultTest.connect(user1).deposit(parseTokenAmount(10n ** 6n, 18), user1.address);

      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 1998323869852000000000000n);
      await checkTotalSupplyApproximate(eightyTwentyRangeStrategyVaultTest, 2001678944277120000000000n);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
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
        clearingHouseLens,
      } = await eightyTwentyRangeStrategyFixture();
      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 6n, 18), user0.address);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        7895036065743972n,
      );
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065743972n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));

      await increaseBlockTimestamp(50000);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 7151872310113270000n, 0, false, false);

      const priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(60000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -1811804019n);

      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .withdraw(parseTokenAmount(5n * 10n ** 5n, 18), user0.address, user0.address);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 498323869852002000000000n);
      await checkTotalSupplyApproximate(eightyTwentyRangeStrategyVaultTest, 499160527861441000000000n);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        3940890370061880n,
      );
      await checkVaultRangeParamsApproximate(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 3940890370061880n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -7151872310113270000n - 3n);
    });

    it('EndToEnd Scenario - Multiple Deposits & Withdrawals', async () => {
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
        clearingHouseLens,
      } = await eightyTwentyRangeStrategyFixture();

      // Initial Deposit - user0
      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 6n, 18), user0.address);

      // await logVaultParams("Initial Deposit - user0",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Initial Deposit - user0",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        7895036065743972n,
      );
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065743972n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 7151872310113270000n, 0, false, false);
      // TODO: Fix the check - expected = -1811804020n
      // await checkAccountNetProfit(clearingHouse,vaultAccountNo,-1811821349n);
      let priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);

      // Initial Deposit - user1
      await increaseBlockTimestamp(10000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -1811804019n);
      await eightyTwentyRangeStrategyVaultTest.connect(user1).deposit(parseTokenAmount(10n ** 6n, 18), user1.address);
      // await logVaultParams("Partial Deposit - user1",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Partial Deposit - user1",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 1998323869852000000000000n);
      await checkTotalSupplyApproximate(eightyTwentyRangeStrategyVaultTest, 2001678944277120000000000n);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        15803327457108200n,
      );
      await checkVaultRangeParamsApproximate(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 15803327457108200n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -7151872310113270000n - 2n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4998.91817108492, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 12047519693643100000n, 0, false, false);
      priceX128 = await priceToPriceX128(1.1585067916761, 6, 18);
      // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);

      // Partial Deposit - user0
      await increaseBlockTimestamp(10000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -6953876307n);
      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .deposit(parseTokenAmount(5n * 10n ** 5n, 18), user0.address);

      // await logVaultParams("Partial Deposit - user0",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Partial Deposit - user0",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 2492321422252749636819074n);
      await checkTotalSupplyApproximate(eightyTwentyRangeStrategyVaultTest, 2504027340956451426520569n);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        19769386166460160n,
      );
      await checkVaultRangeParamsApproximate(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 19769386166460160n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -19199392003756400000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(5608.12126809528, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 15622909187999500000n, 0, false, false);
      priceX128 = await priceToPriceX128(1.24985573493289, 6, 18);
      // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);

      // 24hr Rebalance
      await increaseBlockTimestamp(36400);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -17710346895n);
      await eightyTwentyRangeStrategyVaultTest.rebalance();

      // await logVaultParams("24hr Rebalance",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("24hr Rebalance",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -194470,
        -185530,
        19769386166460160n,
      );
      await checkVaultRangeParamsApproximate(eightyTwentyRangeStrategyVaultTest, -194470, -185530, 19769386166460160n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -34822301191755900000n);
      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 2478151509352049956920444n);
      await checkTotalSupplyApproximate(eightyTwentyRangeStrategyVaultTest, 2504027340956451426520569n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4998.91817108492, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -15622909187999500000n, 0, false, false);
      priceX128 = await priceToPriceX128(1.1585067916761, 6, 18);
      // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);

      // Partial Withdraw - user0
      await increaseBlockTimestamp(10000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, 19423948327n);
      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .withdraw(parseTokenAmount(10n ** 6n, 18), user0.address, user0.address);

      // await logVaultParams("Partial Withdraw - user0",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Partial Withdraw - user0",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -194470,
        -185530,
        11845523675633138n,
      );
      await checkVaultRangeParamsApproximate(eightyTwentyRangeStrategyVaultTest, -194470, -185530, 11845523675633138n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -19199392003756400000n);
      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 1494917874880588339799171n);
      await checkTotalSupplyApproximate(eightyTwentyRangeStrategyVaultTest, 1500376132166142413393317n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4819.27428340935, 6, 18));
      //Arb1 - trader0 : Arb to close user0 withdrawn position
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -7706674136332930000n, 0, false, false);
      priceX128 = await priceToPriceX128(1.13085856364611, 6, 18);
      // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);

      // Partial Withdraw - user1
      await increaseBlockTimestamp(10000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, 2846650658n);
      await eightyTwentyRangeStrategyVaultTest
        .connect(user1)
        .withdraw(parseTokenAmount(5n * 10n ** 5n, 18), user1.address, user1.address);

      // await logVaultParams("Partial Withdraw - user1",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Partial Withdraw - user1",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -194470,
        -185530,
        7890252592360351n,
      );
      await checkVaultRangeParamsApproximate(eightyTwentyRangeStrategyVaultTest, -194470, -185530, 7890252592360351n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -11492717867423500000n);
      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 997435122175186724091219n);
      await checkTotalSupplyApproximate(eightyTwentyRangeStrategyVaultTest, 999394116335405268098379n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4819.27428340935, 6, 18));
      //Arb2 - trader0 : Arb to close user1 withdrawn position
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -3843728083914130000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -7648989783509370000n);
    });

    // Reset Code
    // Reset Code
    it('Reset', async () => {
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
        clearingHouseLens,
      } = await eightyTwentyRangeStrategyFixture();

      let priceX128;
      // Initial Deposit - user0
      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 6n, 18), user0.address);

      // await logVaultParams("Initial Deposit - user0",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Initial Deposit - user0",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        7895036065743972n,
      );
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065743972n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));

      //Swap1 - trader0
      await increaseBlockTimestamp(10);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(6197.90154302086, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 24551300439936500000n, 0, false, false);
      priceX128 = await priceToPriceX128(1.33512488303275, 6, 18);
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);

      // await logVaultParams("Swap1 - trader0",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Swap1 - trader0",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      // Rebalance
      await increaseBlockTimestamp(10);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -29795804009n);
      await eightyTwentyRangeStrategyVaultTest.rebalance();
      // await logVaultParams("Rebalance",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Rebalance",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -193470,
        -184530,
        7895036065743972n,
      );
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -193470, -184530, 7895036065743972n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -24551300439936500000n - 4n);
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 977683133322357000000000n);

      //Swap2 - trader0
      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(8366.16650126176, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 13968118264902500000n, 0, false, false);
      priceX128 = await priceToPriceX128(1.6274509127026, 6, 18);
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);
      // await logVaultParams("Swap2 - trader0",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Swap2 - trader0",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      //Reset
      await increaseBlockTimestamp(10000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -73967033497n);
      await eightyTwentyRangeStrategyVaultTest.rebalance();
      // await logVaultParams("Reset",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Reset",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -190470,
        -181530,
        8282092448944815n,
      );
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -190470, -181530, 8282092448944815n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -38519418704839000000n);
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 932233508427493080464917n);

      //Arb1 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(8366.16650126176, 6, 18));

      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -4517767898552700000n, 0, false, false);
      // await logVaultParams("ClosePositon 1 Before",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("ClosePositon 1 Before",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -34001650806286300000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await eightyTwentyRangeStrategyVaultTest.closeTokenPosition();
      // await logVaultParams("ClosePositon 1 After",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("ClosePositon 1 After",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      //Arb2 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(8366.16650126176, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -4517767898552700000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -29483882907733600000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await eightyTwentyRangeStrategyVaultTest.closeTokenPosition();
      // await logVaultParams("ClosePositon 2",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("ClosePositon 2",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);
      //Arb3 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(8366.16650126176, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -4517767898552700000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -24966115009180900000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await eightyTwentyRangeStrategyVaultTest.closeTokenPosition();
      // await logVaultParams("ClosePositon 3",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("ClosePositon 3",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);
      //Arb4 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(8366.16650126176, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -4517767898552700000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -20448347110628200000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await eightyTwentyRangeStrategyVaultTest.closeTokenPosition();
      // await logVaultParams("ClosePositon 4",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("ClosePositon 4",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);
      //Arb5 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(8366.16650126176, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -4517767898552700000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -15930579212075500000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await eightyTwentyRangeStrategyVaultTest.closeTokenPosition();
      // await logVaultParams("ClosePositon 5",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("ClosePositon 5",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);
      //Arb6 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(8366.16650126176, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -4517767898552700000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -11412811313522800000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await eightyTwentyRangeStrategyVaultTest.closeTokenPosition();
      // await logVaultParams("ClosePositon 6",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("ClosePositon 6",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);
      //Arb7 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(8366.16650126176, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -4517767898552700000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -6895043414970090000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await eightyTwentyRangeStrategyVaultTest.closeTokenPosition();

      //Arb8 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(8366.16650126176, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -4517767898552700000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -2377275516417390000n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await eightyTwentyRangeStrategyVaultTest.closeTokenPosition();

      //Arb9 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(8366.16650126176, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -2377275516417390000n, 0, false, false);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, 0);
      expect(await eightyTwentyRangeStrategyVaultTest.isReset()).to.be.false;
      await expect(eightyTwentyRangeStrategyVaultTest.closeTokenPosition()).to.be.revertedWith('ETRS_INVALID_CLOSE');
    });
    it('Slippage Threshold - Partial Withdraw', async () => {
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
        clearingHouseLens,
      } = await eightyTwentyRangeStrategyFixture();
      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 6n, 18), user0.address);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkLiquidityPosition(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        7895036065743972n,
      );
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065743972n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));

      // await logVaultParams("Deposit - user1",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Deposit - user1",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await increaseBlockTimestamp(10000);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 7151872310113270000n, 0, false, false);

      const priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      await eightyTwentyRangeStrategyVaultTest.setYieldTokenPriceX128(priceX128);

      // await logVaultParams("Swap1 - trader0",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Swap1 - trader0",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await increaseBlockTimestamp(10000);
      await checkAccountNetProfit(clearingHouse, vaultAccountNo, -1811804019n);

      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .withdraw(parseTokenAmount(8n * 10n ** 5n, 18), user0.address, user0.address);
      await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      await checkTotalAssetsApproximate(eightyTwentyRangeStrategyVaultTest, 216607270713516000000000n);
      await checkTotalSupplyApproximate(eightyTwentyRangeStrategyVaultTest, 216970942251063000000000n);
      await checkLiquidityPositionApproximate(
        clearingHouseLens,
        vaultAccountNo,
        ethPoolId,
        0,
        -197850,
        -188910,
        1712993414290590n,
      );
      await checkVaultRangeParamsApproximate(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 1712993414290590n);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -7151872310113270000n);

      // await logVaultParams("Withdraw - user1",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Withdraw - user1",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);

      await increaseBlockTimestamp(10000);

      //Arb1 - trader0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4961.56838901073, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -5600123836128710000n, 0, false, false);
      await increaseBlockTimestamp(10000);
      await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -1551748473984560000n);
      // await logVaultParams("Arb1 - trader0",eightyTwentyRangeStrategyVaultTest);
      // await logRageParams("Arb1 - trader0",clearingHouse,ethPool.vPool,vaultAccountNo,0,0);
    });
  });
});
