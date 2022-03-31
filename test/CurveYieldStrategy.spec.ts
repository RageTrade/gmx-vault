import { assert, expect } from 'chai';
import addresses from './fixtures/addresses';
import hre, { deployments, ethers } from 'hardhat';
import { curveYieldStrategyFixture } from './fixtures/curve-yield-strategy';
import { BigNumber } from 'ethers';

describe('CurveYieldStrategy', () => {
  beforeEach(async () => {
    await curveYieldStrategyFixture();
  });

  describe('#deposit', () => {
    it('should perform approvals', async () => {
      const [admin] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest } = await curveYieldStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(admin);

      const before = await Promise.all([
        crv.allowance(curveYieldStrategy.address, addresses.ROUTER),
        usdt.allowance(curveYieldStrategy.address, addresses.TRICRYPTO_POOL),
        lpToken.allowance(curveYieldStrategy.address, addresses.TRICRYPTO_POOL),
      ])

      expect(before).to.be.eql([
        BigNumber.from(0),
        BigNumber.from(0),
        BigNumber.from(0),
      ])

      await curveYieldStrategy.grantAllowances();

      const after = await Promise.all([
        crv.allowance(curveYieldStrategy.address, addresses.ROUTER),
        usdt.allowance(curveYieldStrategy.address, addresses.TRICRYPTO_POOL),
        lpToken.allowance(curveYieldStrategy.address, addresses.TRICRYPTO_POOL),
      ])

      expect(after).to.be.eql([
        ethers.constants.MaxUint256,
        ethers.constants.MaxUint256,
        ethers.constants.MaxUint256,
      ])

    });

    it('should transfer tokens', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest } = await curveYieldStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(user);

      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [addresses.LP_TOKEN_WHALE],
      });

      const whale = await ethers.getSigner(addresses.LP_TOKEN_WHALE)
      const amount = BigNumber.from(10).pow(18).mul(50);

      await curveYieldStrategy
        .connect(admin)
        .updateDepositCap(amount)

      const before = await lpToken.balanceOf(curveYieldStrategy.address)

      await lpToken
        .connect(whale)
        .transfer(user.address, amount)

      await lpToken
        .connect(user)
        .approve(curveYieldStrategy.address, amount);

      await curveYieldStrategy.deposit(amount, user.address);

      const after = await lpToken.balanceOf(curveYieldStrategy.address)

      expect(before).to.be.equal(BigNumber.from(0));
      expect(after).to.be.equal(BigNumber.from(0));

      expect(await curveYieldStrategy.balanceOf(user.address)).to.be.eq(amount);
    });

    it('should add liquidity', async () => {

    });
  });

  describe('#internal', () => {
    it('should deposit usdc', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest } = await curveYieldStrategyFixture();
      const curveYieldStrategy = curveYieldStrategyTest.connect(user);

      
    });
    it('should withdraw usdc', async () => {});
  });

  describe('#withdraw', () => {
    it('should pull LP from pool');
    it('should claim fees from LP');
    it('should deduct rage fee (10% which can be changed)');
    it('should transfer to user');
  });

  describe('#lpPrice', () => {
    it('should calculate TVL of vault');
  });

  describe('#fee', () => {
    it('should handle fee changes');
  });
});
