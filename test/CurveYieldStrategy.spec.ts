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

  describe('#collateral-shifting', () => {
    it('should deposit & withdraw usdc', async () => {
      const [, user1, user2] = await hre.ethers.getSigners();
      const { usdc, gauge, lpToken, curveYieldStrategyTest: curveYieldStrategy } = await curveYieldStrategyFixture();

      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [addresses.USDC_WHALE],
      });

      const whale = await ethers.getSigner(addresses.USDC_WHALE);

      const amount1 = BigNumber.from(10).pow(6).mul(600);
      const amount2 = BigNumber.from(10).pow(6).mul(400);
      const amount = amount1.add(amount2);

      await usdc.connect(whale).transfer(user1.address, amount1);
      await usdc.connect(whale).transfer(user2.address, amount2);

      await usdc.connect(user1).approve(curveYieldStrategy.address, amount1);
      await usdc.connect(user2).approve(curveYieldStrategy.address, amount2);

      const [user1UsdcBalBefore, user2UsdcBalBefore, vaultUsdcBalBefore, gaugeLpBalBefore, vaultLpBalBefore] =
        await Promise.all([
          usdc.balanceOf(user1.address),
          usdc.balanceOf(user2.address),
          usdc.balanceOf(curveYieldStrategy.address),
          lpToken.balanceOf(gauge.address),
          lpToken.balanceOf(curveYieldStrategy.address),
        ]);

      await curveYieldStrategy.connect(user1).depositUsdc(amount1);

      const [
        user1UsdcBalAfterFirstDeposit,
        user2UsdcBalAfterFirstDeposit,
        vaultUsdcBalAfterFirstDeposit,
        gaugeLpBalAfterFirstDeposit,
        vaultLpBalAfterFirstDeposit,
      ] = await Promise.all([
        usdc.balanceOf(user1.address),
        usdc.balanceOf(user2.address),
        usdc.balanceOf(curveYieldStrategy.address),
        lpToken.balanceOf(gauge.address),
        lpToken.balanceOf(curveYieldStrategy.address),
      ]);

      await curveYieldStrategy.connect(user2).depositUsdc(amount2);

      const [
        user1UsdcBalAfterSecondDeposit,
        user2UsdcBalAfterSecondDeposit,
        vaultUsdcBalAfterSecondDeposit,
        gaugeLpBalAfterSecondDeposit,
        vaultLpBalAfterSecondDeposit,
      ] = await Promise.all([
        usdc.balanceOf(user1.address),
        usdc.balanceOf(user2.address),
        usdc.balanceOf(curveYieldStrategy.address),
        lpToken.balanceOf(gauge.address),
        lpToken.balanceOf(curveYieldStrategy.address),
      ]);

      expect(user1UsdcBalBefore).to.be.eq(amount1);
      expect(user2UsdcBalBefore).to.be.eq(amount2);
      expect(vaultUsdcBalBefore).to.be.eq(0);

      expect(gaugeLpBalBefore).to.be.gt(0);
      expect(vaultLpBalBefore).to.be.eq(0);

      expect(user1UsdcBalAfterFirstDeposit).to.be.eq(0);
      expect(user2UsdcBalAfterFirstDeposit).to.be.eq(amount2);
      expect(vaultUsdcBalAfterFirstDeposit).to.be.eq(0);

      expect(gaugeLpBalAfterFirstDeposit).to.be.gt(gaugeLpBalBefore);
      expect(vaultLpBalAfterFirstDeposit).to.be.eq(0);

      expect(user1UsdcBalAfterSecondDeposit).to.be.eq(user1UsdcBalAfterFirstDeposit);
      expect(user2UsdcBalAfterSecondDeposit).to.be.eq(0);
      expect(vaultUsdcBalAfterSecondDeposit).to.be.eq(0);

      expect(gaugeLpBalAfterSecondDeposit).to.be.gt(gaugeLpBalAfterFirstDeposit);
      expect(vaultLpBalAfterSecondDeposit).to.be.eq(0);
    });
  });

  describe('#withdraw', () => {
    it('should pull LP from pool', async () => {
      const [admin, user1, user2] = await hre.ethers.getSigners();
      const { gauge, lpToken, curveYieldStrategyTest: curveYieldStrategy } = await curveYieldStrategyFixture();

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
      // await hre.network.provider.send('evm_increaseTime', [1_000_000]);
      // await hre.network.provider.send('evm_mine', []);

      await curveYieldStrategy.connect(user2).deposit(amount2, user2.address);
      await hre.network.provider.send('evm_increaseTime', [1_000_000]);
      await hre.network.provider.send('evm_mine', []);

      let user1AssetBal = await curveYieldStrategy.assetsOf(user1.address);
      user1AssetBal = await curveYieldStrategy.previewWithdraw(user1AssetBal);

      const [
        user1LpBalBefore,
        user2LpBalBefore,
        gaugeLpBalBefore,
        vaultLpBalBefore,
        user1SharesBalBefore,
        user2SharesBalBefore,
        totalSharesMintedBefore,
        totalAssetvalueBefore,
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

      await curveYieldStrategy.connect(user1).withdraw(user1AssetBal, user1.address, user1.address);

      // console.log('mid')
      // console.log(await curveYieldStrategy.assetsOf(user1.address))
      // console.log(await curveYieldStrategy.assetsOf(user2.address))
      // console.log(await curveYieldStrategy.balanceOf(user1.address))
      // console.log(await curveYieldStrategy.balanceOf(user2.address))

      await hre.network.provider.send('evm_increaseTime', [1_000_000]);
      await hre.network.provider.send('evm_mine', []);

      const pricePerShareBefore = (await curveYieldStrategy.totalAssets()).div(await curveYieldStrategy.totalSupply());

      let user2AssetBal = await curveYieldStrategy.assetsOf(user2.address);
      user2AssetBal = await curveYieldStrategy.previewWithdraw(user2AssetBal);

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
        curveYieldStrategy.totalSupply(),
        curveYieldStrategy.totalAssets(),
      ]);

      const pricePerShareAfterFirstWithdraw = (await curveYieldStrategy.totalAssets()).div(
        await curveYieldStrategy.totalSupply(),
      );

      await curveYieldStrategy.connect(user2).withdraw(user2AssetBal, user2.address, user2.address);
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
        curveYieldStrategy.totalSupply(),
        curveYieldStrategy.totalAssets(),
      ]);
<<<<<<< Updated upstream
=======
      // console.log('after')
      // console.log(await curveYieldStrategy.assetsOf(user1.address))
      // console.log(await curveYieldStrategy.assetsOf(user2.address))
      // console.log(await curveYieldStrategy.balanceOf(user1.address))
      // console.log(await curveYieldStrategy.balanceOf(user2.address))
>>>>>>> Stashed changes

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

      expect(user1SharesBalAfterFirstWithdraw).to.be.eq(0);
      expect(user2SharesBalAfterFirstWithdraw).to.be.eq(user2SharesBalBefore);

      expect(totalAssetvalueAfterFirstWithdraw).to.be.lt(totalAssetvalueBefore);
      expect(totalSharesMintedAfterFirstWithdraw).to.be.lt(user2SharesBalAfterFirstWithdraw);

      expect(user1LpBalAfterSecondWithdraw).to.be.eq(user1LpBalAfterFirstWithdraw);
      expect(user2LpBalAfterSecondWithdraw).to.be.eq(
        pricePerShareAfterFirstWithdraw.mul(user2SharesBalAfterFirstWithdraw),
      );

      expect(gaugeLpBalAfterSecondWithdraw).to.be.lt(gaugeLpBalAfterFirstWithdraw);
      expect(vaultLpBalAfterSecondWithdraw).to.be.eq(0);

      expect(user1SharesBalAfterSecondWithdraw).to.be.eq(user1SharesBalAfterFirstWithdraw);
      expect(user2SharesBalAfterSecondWithdraw).to.be.eq(0);

      expect(totalAssetvalueAfterSecondWithdraw).to.be.eq(0);
      expect(totalSharesMintedAfterSecondWithdraw).to.be.eq(0);
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
