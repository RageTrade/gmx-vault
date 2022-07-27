import { impersonateAccount } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { priceX128ToPrice } from '@ragetrade/sdk';
import { expect } from 'chai';
import { formatEther, parseEther } from 'ethers/lib/utils';
import hre from 'hardhat';
import { ERC20, GMXYieldStrategy } from '../typechain-types';
import { gmxYieldStrategyFixture } from './fixtures/gmx-yield-strategy';
import { activateMainnetFork } from './utils/mainnet-fork';
describe('GmxYieldStrategy', () => {
  let gmxYieldStrategy: GMXYieldStrategy;
  let sGLP: ERC20;
  let fsGLP: ERC20;
  let signers: SignerWithAddress[];
  let whale: SignerWithAddress;

  before(async () => {
    await activateMainnetFork({ blockNumber: 18099162 });
    await gmxYieldStrategyFixture();
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
      const userSharesBefore = await gmxYieldStrategy.balanceOf(whale.address);
      expect(userSharesBefore.toString()).to.eq('0');

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
    it('withdraws tokens that are deposits', async () => {
      await sGLP.connect(whale).approve(gmxYieldStrategy.address, parseEther('1'));
      await gmxYieldStrategy.connect(whale).deposit(parseEther('1'), whale.address);

      const userSharesBefore = await gmxYieldStrategy.balanceOf(whale.address);

      await gmxYieldStrategy.connect(whale).withdraw(parseEther('0.9'), whale.address, whale.address);

      const userSharesAfter = await gmxYieldStrategy.balanceOf(whale.address);

      expect(userSharesBefore.sub(userSharesAfter).toString()).to.eq(parseEther('0.9'));
    });
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

  describe('#getPriceX128', () => {
    it('gives value between 0.8 and 1.2', async () => {
      const priceX128 = await gmxYieldStrategy.getPriceX128();
      const number = await priceX128ToPrice(priceX128, 6, 18); // usdc, asset
      expect(Math.abs(1 - number)).to.be.lessThan(0.2);
    });
  });

  describe('#withdrawToken', () => {
    it('withdraws token and burns shares');
    it('does not withdraw if not enough shares');
  });

  describe('#redeemToken', () => {
    it('works');
  });
});
