import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';

import addresses from './fixtures/addresses';
import { curveYieldStrategyFixture } from './fixtures/curve-yield-strategy';

describe('CurveYieldStrategy', () => {
  beforeEach(async () => {
    await curveYieldStrategyFixture();
  });

  describe('#deposit', () => {
    it('should perform approvals by vault', async () => {
      const [admin] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest } = await curveYieldStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(admin);

      const before = await Promise.all([
        crv.allowance(curveYieldStrategy.address, addresses.ROUTER),
        usdt.allowance(curveYieldStrategy.address, addresses.TRICRYPTO_POOL),
        lpToken.allowance(curveYieldStrategy.address, addresses.TRICRYPTO_POOL),
      ]);

      await curveYieldStrategy.grantAllowances();

      const after = await Promise.all([
        crv.allowance(curveYieldStrategy.address, addresses.ROUTER),
        usdt.allowance(curveYieldStrategy.address, addresses.TRICRYPTO_POOL),
        lpToken.allowance(curveYieldStrategy.address, addresses.TRICRYPTO_POOL),
      ]);

      expect(before).to.be.eql([BigNumber.from(0), BigNumber.from(0), BigNumber.from(0)]);
      expect(after).to.be.eql([ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256]);
    });

    it('should transfer lp tokens & mint shares', async () => {
      const [admin, user1, user2] = await hre.ethers.getSigners();
      const { gauge, lpToken, curveYieldStrategyTest: curveYieldStrategy } = await curveYieldStrategyFixture();

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
  });

  describe('#internal', () => {
    it('should deposit usdc', async () => {
      const [, user] = await hre.ethers.getSigners();
      const { usdc, curveYieldStrategyTest } = await curveYieldStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(user);

      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [addresses.USDC_WHALE],
      });
      const whale = await ethers.getSigner(addresses.USDC_WHALE);
      const amount = BigNumber.from(10).pow(6).mul(1000);

      await usdc.connect(whale).transfer(user.address, amount);

      await usdc.connect(user).approve(curveYieldStrategy.address, amount);

      await curveYieldStrategy.depositUsdc(amount);

      await curveYieldStrategy.withdrawUsdc(BigNumber.from(990000000));
    });

    it('should withdraw usdc', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, usdc, lpToken, curveYieldStrategyTest } = await curveYieldStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(user);
    });
  });

  describe('#withdraw', () => {
    it('should pull LP from pool', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest } = await curveYieldStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(user);

      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [addresses.LP_TOKEN_WHALE],
      });

      const whale = await ethers.getSigner(addresses.LP_TOKEN_WHALE);
      const amount = BigNumber.from(10).pow(18).mul(50);

      await curveYieldStrategy.connect(admin).updateDepositCap(amount);

      const before = await lpToken.balanceOf(curveYieldStrategy.address);

      await lpToken.connect(whale).transfer(user.address, amount);

      await lpToken.connect(user).approve(curveYieldStrategy.address, amount);

      await curveYieldStrategy.deposit(amount, user.address);

      await curveYieldStrategy.withdraw(amount, user.address, user.address);
    });

    it('should claim fees from LP', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest, gauge } = await curveYieldStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(user);

      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [addresses.LP_TOKEN_WHALE],
      });

      const whale = await ethers.getSigner(addresses.LP_TOKEN_WHALE);

      const amount1 = BigNumber.from(10).pow(18).mul(40);
      const amount2 = BigNumber.from(10).pow(18).mul(10);
      const amount = amount1.add(amount2);

      await curveYieldStrategy.connect(admin).updateDepositCap(amount);

      await lpToken.connect(whale).transfer(user.address, amount);
      await lpToken.connect(user).approve(curveYieldStrategy.address, amount);

      await curveYieldStrategy.deposit(amount, user.address);

      await hre.network.provider.send('evm_increaseTime', [1_000_000]);
      await hre.network.provider.send('evm_mine', []);

      await gauge.claimable_reward_write(curveYieldStrategy.address, addresses.CRV);

      await curveYieldStrategy.harvestFees();
    });

    it('should deduct rage fee (10% which can be changed)', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest, triCrypto } = await curveYieldStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(admin);

      await curveYieldStrategy.withdrawFees();
    });
  });

  describe('#lpPrice', () => {
    it('should calculate TVL of vault', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest } = await curveYieldStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(user);

      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [addresses.LP_TOKEN_WHALE],
      });

      const whale = await ethers.getSigner(addresses.LP_TOKEN_WHALE);
      const amount = BigNumber.from(10).pow(18).mul(50);

      await curveYieldStrategy.connect(admin).updateDepositCap(amount);

      const before = await lpToken.balanceOf(curveYieldStrategy.address);

      await lpToken.connect(whale).transfer(user.address, amount);

      await lpToken.connect(user).approve(curveYieldStrategy.address, amount);

      await curveYieldStrategy.deposit(amount, user.address);

      const output = await curveYieldStrategy.getVaultMarketValue();
      console.log(output);
    });
  });

  describe('#fee', () => {
    it('should handle fee changes', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest, triCrypto } = await curveYieldStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(admin);

      await curveYieldStrategy.changeFee(2000);
    });
  });
});
