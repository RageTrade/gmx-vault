import { impersonateAccount } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';
import hre from 'hardhat';
import { ERC20, GMXYieldStrategy } from '../typechain-types';
import { gmxYieldStrategyFixture } from './fixtures/gmx-yield-strategy';

describe('GmxYieldStrategy', () => {
  let gmxYieldStrategy: GMXYieldStrategy;
  let sGLP: ERC20;
  let fsGLP: ERC20;
  let signers: SignerWithAddress[];
  let whale: SignerWithAddress;

  before(async () => {
    signers = await hre.ethers.getSigners();

    await impersonateAccount('0x087e9c8ef2d97740340a471ff8bb49f5490f6cf6');
    whale = await hre.ethers.getSigner('0x087e9c8ef2d97740340a471ff8bb49f5490f6cf6');
  });

  beforeEach(async () => {
    ({ gmxYieldStrategy, sGLP, fsGLP } = await gmxYieldStrategyFixture());
  });

  describe('#deposit', () => {
    it('deposits tokens', async () => {
      const userBalBefore = await fsGLP.balanceOf(whale.address);

      const vaultBalBefore = await fsGLP.balanceOf(gmxYieldStrategy.address);

      await sGLP.connect(whale).approve(gmxYieldStrategy.address, parseEther('1'));
      await gmxYieldStrategy.connect(whale).deposit(parseEther('1'), signers[0].address);

      const userBalAfter = await fsGLP.balanceOf(whale.address);
      const vaultBalAfter = await fsGLP.balanceOf(gmxYieldStrategy.address);

      expect(userBalBefore.sub(userBalAfter).toString()).to.eq(parseEther('1').toString());
      expect(vaultBalAfter.sub(vaultBalBefore).toString()).to.eq(parseEther('1').toString());
    });

    it('prevents deposit more than balance', async () => {
      await sGLP.approve(gmxYieldStrategy.address, parseEther('1'));
      await expect(gmxYieldStrategy.deposit(parseEther('1'), signers[0].address)).to.be.revertedWith(
        'RewardTracker: _amount exceeds stakedAmount',
      );
    });

    it('prevents deposit more than deposit cap', async () => {
      const depositCap = await gmxYieldStrategy.depositCap();
      await sGLP.connect(whale).approve(gmxYieldStrategy.address, depositCap.add(1));
      await expect(gmxYieldStrategy.connect(whale).deposit(depositCap.add(1), signers[0].address)).to.be.revertedWith(
        'BV_DepositCap(100000000000000000000, 100000000000000000001)',
      );
    });
  });

  describe('#withdraw', () => {
    it('withdraws tokens that are deposits', async () => {});
    it('prevents withdraw if less balance');
  });

  describe('#updateGMXParams', () => {
    it('allows owner to update params');
    it('reverts when not owner');
  });

  describe('#withdrawFees', () => {
    it('withdraws fees and updates state');
  });

  describe('#getMarketValue', () => {
    it('works');
  });

  describe('#withdrawToken', () => {
    it('withdraws token and burns shares');
    it('does not withdraw if not enough shares');
  });

  describe('#redeemToken', () => {
    it('works');
  });
});
