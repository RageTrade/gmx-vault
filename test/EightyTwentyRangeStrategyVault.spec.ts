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
  updateSettlementTokenMargin,
} from './utils/rageHelpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  checkTotalAssets,
  checkTotalSupply,
  checkVaultRangeParams,
  increaseBlockTimestamp,
} from './utils/vaultHelpers';
import { sqrtPriceX96ToPrice, sqrtPriceX96ToTick } from '@ragetrade/core/test/utils/price-tick';

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
  describe.skip('#Scenarios', () => {
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

      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065729730n);

      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 7895036065729730n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);

      await increaseBlockTimestamp(50000);

      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 7151872310100370000n, 0, false, false);

      await increaseBlockTimestamp(86400);
      await eightyTwentyRangeStrategyVaultTest.rebalance();
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -196670, -187730, 7895036065729730n);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -196670, -187730, 7895036065729730n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -7151872310100370000n - 1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, 998322152514091000000000n);
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
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
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 7895036065729730n);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065729730n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));

      await increaseBlockTimestamp(50000);

      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 7151872310100370000n, 0, false, false);

      await increaseBlockTimestamp(60000);
      await eightyTwentyRangeStrategyVaultTest.connect(user1).deposit(parseTokenAmount(10n ** 6n, 18), user1.address);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -196670, -187730, 15776603845530100n);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -196670, -187730, 15776603845530100n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -7151872310100370000n - 1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, 1998294081772750000000000n);
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, 2001708833357220000000000n);
    });

    it('Partial Withdraw', async () => {
      const {
        eightyTwentyRangeStrategyVaultTest,
        clearingHouse,
        vaultAccountNo,
        settlementTokenTreasury,
        settlementToken,
        ethPoolId,
        user0,
        trader0,
        trader0AccountNo,
      } = await eightyTwentyRangeStrategyFixture();
      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 6n, 18), user0.address);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -197850, -188910, 7895036065729730n);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -197850, -188910, 7895036065729730n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, parseTokenAmount(10n ** 6n, 18));

      await increaseBlockTimestamp(50000);

      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 7151872310100370000n, 0, false, false);

      await increaseBlockTimestamp(60000);
      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .withdraw(parseTokenAmount(5n * 10n ** 5n, 18), user0.address, user0.address);
      await checkLiquidityPositionNum(clearingHouse, vaultAccountNo, 0, 1);
      await checkLiquidityPosition(clearingHouse, vaultAccountNo, 0, 0, -196670, -187730, 3934271366450820n);
      await checkVaultRangeParams(eightyTwentyRangeStrategyVaultTest, -196670, -187730, 3934271366450820n);
      await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -3563936404075160000n - 1n);
      await checkTotalAssets(eightyTwentyRangeStrategyVaultTest, 498322152514091000000000n);
      await checkTotalSupply(eightyTwentyRangeStrategyVaultTest, 499159666305269000000000n);
    });
  });
});
