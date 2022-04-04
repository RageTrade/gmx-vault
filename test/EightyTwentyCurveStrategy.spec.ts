import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';

import addresses from './fixtures/addresses';
import { eightyTwentyCurveStrategyFixture } from './fixtures/eighty-twenty-curve-strategy';

const within = (value: BigNumber, start: BigNumber, end: BigNumber): Boolean => {
  if (value.gte(start) && value.lte(end)) return true;
  return false;
};

describe('EightyTwentyCurveStrategy', () => {
  before(async () => {
    await eightyTwentyCurveStrategyFixture();
  });

  describe('No Price Movement', () => {
    it.skip('Deposit - should transfer lp tokens & mint shares', async () => {
      const [admin, user1, user2] = await hre.ethers.getSigners();
      const { gauge, lpToken, curveYieldStrategyTest: curveYieldStrategy } = await eightyTwentyCurveStrategyFixture();

      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [addresses.LP_TOKEN_WHALE],
      });

      const whale = await ethers.getSigner(addresses.LP_TOKEN_WHALE);

      const amount1 = BigNumber.from(10).pow(18).mul(40);
      const amount2 = BigNumber.from(10).pow(18).mul(10);
      const amount = amount1.add(amount2);

      await curveYieldStrategy.connect(admin).updateDepositCap(amount);

      await lpToken.connect(whale).transfer(user1.address, amount1);
      await lpToken.connect(whale).transfer(user2.address, amount2);

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

    it.skip('Withdraw - should pull LP from pool', async () => {
      const [admin, user1, user2] = await hre.ethers.getSigners();
      const { gauge, lpToken, curveYieldStrategyTest: curveYieldStrategy } = await eightyTwentyCurveStrategyFixture();

      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [addresses.LP_TOKEN_WHALE],
      });

      const whale = await ethers.getSigner(addresses.LP_TOKEN_WHALE);

      const amount1 = BigNumber.from(10).pow(18).mul(25);
      const amount2 = BigNumber.from(10).pow(18).mul(25);
      const amount = amount1.add(amount2);

      await curveYieldStrategy.connect(admin).updateDepositCap(amount);

      await lpToken.connect(whale).transfer(user1.address, amount1);
      await lpToken.connect(whale).transfer(user2.address, amount2);

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
  describe('Protocol Fee Withdrawal', () => {
    it('should deduct rage fee (10% which can be changed)', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest, triCrypto } = await eightyTwentyCurveStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(admin);

      await curveYieldStrategy.withdrawFees();
    });
  });
});
