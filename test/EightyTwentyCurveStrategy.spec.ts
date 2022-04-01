import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';

import addresses from './fixtures/addresses';
import { eightyTwentyCurveStrategyFixture } from './fixtures/eighty-twenty-curve-strategy';

describe('CurveYieldStrategy', () => {
  beforeEach(async () => {
    await eightyTwentyCurveStrategyFixture();
  });

  describe('#deposit', () => {
    it('should perform approvals', async () => {
      const [admin] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest } = await eightyTwentyCurveStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(admin);

      const after = await Promise.all([
        crv.allowance(curveYieldStrategy.address, addresses.ROUTER),
        usdt.allowance(curveYieldStrategy.address, addresses.TRICRYPTO_POOL),
        lpToken.allowance(curveYieldStrategy.address, addresses.TRICRYPTO_POOL),
      ]);

      expect(after).to.be.eql([ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256]);
    });

    it('should transfer tokens', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest } = await eightyTwentyCurveStrategyFixture();
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

      const after = await lpToken.balanceOf(curveYieldStrategy.address);

      expect(before).to.be.equal(BigNumber.from(0));
      expect(after).to.be.equal(BigNumber.from(0));

      expect(await curveYieldStrategy.balanceOf(user.address)).to.be.eq(amount);
    });

    it('should add liquidity', async () => {});
  });

  describe('#withdraw', () => {
    it.skip('should pull LP from pool', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest } = await eightyTwentyCurveStrategyFixture();
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

    it('should deduct rage fee (10% which can be changed)', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest, triCrypto } = await eightyTwentyCurveStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(admin);

      await curveYieldStrategy.withdrawFees();
    });
  });

  describe('#lpPrice', () => {
    it('should calculate TVL of vault', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest } = await eightyTwentyCurveStrategyFixture();
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
      const { crv, usdt, lpToken, curveYieldStrategyTest, triCrypto } = await eightyTwentyCurveStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(admin);

      await curveYieldStrategy.changeFee(2000);
    });
  });
});
