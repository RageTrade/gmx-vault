import { impersonateAccount } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { priceX128ToPrice } from '@ragetrade/sdk';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { formatEther, parseEther } from 'ethers/lib/utils';
import hre, { ethers } from 'hardhat';
import {
  ERC20,
  GMXYieldStrategy,
  IGlpManager__factory,
  IERC20__factory,
  IRewardTracker__factory,
  GMXBatchingManager,
  GlpStakingManager,
} from '../typechain-types';
import addresses, { GMX_ECOSYSTEM_ADDRESSES } from './fixtures/addresses';
import { gmxYieldStrategyFixture } from './fixtures/gmx-yield-strategy';
import { activateMainnetFork } from './utils/mainnet-fork';

describe('GmxYieldStrategy', () => {
  let gmxYieldStrategy: GMXYieldStrategy;
  let sGLP: ERC20;
  let fsGLP: ERC20;
  let signers: SignerWithAddress[];
  let whale: SignerWithAddress;
  let gmxBatchingManager: GMXBatchingManager;
  let glpStakingManager: GlpStakingManager;

  before(async () => {
    await activateMainnetFork({ blockNumber: 18099162 });
    await gmxYieldStrategyFixture();
    signers = await hre.ethers.getSigners();

    await impersonateAccount('0x087e9c8ef2d97740340a471ff8bb49f5490f6cf6');
    whale = await hre.ethers.getSigner('0x087e9c8ef2d97740340a471ff8bb49f5490f6cf6');
  });

  beforeEach(async () => {
    ({ gmxYieldStrategy, sGLP, fsGLP, gmxBatchingManager, glpStakingManager } = await gmxYieldStrategyFixture());
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
      const vaultBalAfter = (await fsGLP.balanceOf(gmxYieldStrategy.address)).add(
        await glpStakingManager.maxWithdraw(gmxYieldStrategy.address),
      );

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

      const assetsBefore = await gmxYieldStrategy.convertToAssets(await gmxYieldStrategy.balanceOf(whale.address));
      // console.log('assetsBefore', assetsBefore);

      const tx = await (
        await gmxYieldStrategy.connect(whale).withdraw(parseEther('0.9'), whale.address, whale.address)
      ).wait();

      const filter = gmxBatchingManager.filters.DepositToken();

      const logs = await gmxBatchingManager.queryFilter(filter, tx.blockHash);

      const additional = logs[0].args.glpStaked;

      const assetsAfter = await gmxYieldStrategy.convertToAssets(await gmxYieldStrategy.balanceOf(whale.address));

      expect(assetsAfter).gt(assetsBefore.add(additional).div(10));
    });
    it('prevents withdraw if less balance', async () => {
      await sGLP.connect(whale).approve(gmxYieldStrategy.address, parseEther('1'));
      await gmxYieldStrategy.connect(whale).deposit(parseEther('1'), whale.address);
      await expect(gmxYieldStrategy.connect(whale).withdraw(parseEther('1.1'), whale.address, whale.address)).to.be
        .reverted;
    });
  });

  describe('#redeem', () => {
    it('withdraws tokens that are deposits', async () => {
      await sGLP.connect(whale).approve(gmxYieldStrategy.address, parseEther('1'));
      await gmxYieldStrategy.connect(whale).deposit(parseEther('1'), whale.address);

      const userSharesBefore = await gmxYieldStrategy.balanceOf(whale.address);
      // console.log('userSharesBefore', userSharesBefore);

      await gmxYieldStrategy.connect(whale).redeem(parseEther('0.9'), whale.address, whale.address);

      const userSharesAfter = await gmxYieldStrategy.balanceOf(whale.address);
      // console.log('userSharesAfter', userSharesAfter);

      expect(userSharesBefore.sub(userSharesAfter).toString()).to.eq(parseEther('0.9'));
    });
    it('prevents withdraw if less balance', async () => {
      await sGLP.connect(whale).approve(gmxYieldStrategy.address, parseEther('1'));
      await gmxYieldStrategy.connect(whale).deposit(parseEther('1'), whale.address);
      await expect(gmxYieldStrategy.connect(whale).withdraw(parseEther('1.1'), whale.address, whale.address)).to.be
        .reverted;
    });
  });

  describe('#updateGMXParams', () => {
    it('allows owner to update params', async () => {
      await expect(gmxYieldStrategy.updateGMXParams(signers[0].address, signers[0].address, 10, 0))
        .to.emit(gmxYieldStrategy, 'GmxParamsUpdated')
        .withArgs(signers[0].address, signers[0].address, 10, 0);
    });

    it('reverts when not owner', async () => {
      await expect(
        gmxYieldStrategy.connect(signers[1]).updateGMXParams(signers[0].address, signers[0].address, 10, 0),
      ).to.be.revertedWith(
        `VM Exception while processing transaction: reverted with reason string 'Ownable: caller is not the owner'`,
      );
    });
  });

  // describe('#withdrawFees', () => {
  //   it('withdraws fees and updates state', async () => {});
  // });

  describe('#getMarketValue', () => {
    it('works', async () => {
      await sGLP.connect(whale).approve(gmxYieldStrategy.address, parseEther('2'));
      await gmxYieldStrategy.connect(whale).deposit(parseEther('2'), whale.address);

      const glpManager = IGlpManager__factory.connect(GMX_ECOSYSTEM_ADDRESSES.GlpManager, signers[0]);
      const glp = IERC20__factory.connect(GMX_ECOSYSTEM_ADDRESSES.GLP, signers[0]);

      const aum = await glpManager.getAum(false);
      const totalSupply = await glp.totalSupply();

      const price = aum.div(totalSupply).div(10 ** 6);
      const mktValue = await gmxYieldStrategy.getMarketValue(parseEther('1'));

      expect(price).eq(mktValue);
    });
  });

  describe('#getVaultMarketValue', () => {
    it('works', async () => {
      await sGLP.connect(whale).approve(gmxYieldStrategy.address, parseEther('2'));
      await gmxYieldStrategy.connect(whale).deposit(parseEther('2'), whale.address);

      const mktValue = await gmxYieldStrategy.getVaultMarketValue();

      const glpManager = IGlpManager__factory.connect(GMX_ECOSYSTEM_ADDRESSES.GlpManager, signers[0]);
      const glp = IERC20__factory.connect(GMX_ECOSYSTEM_ADDRESSES.GLP, signers[0]);

      const aum = await glpManager.getAum(false);
      const totalSupply = await glp.totalSupply();

      const price = aum.div(totalSupply).div(10 ** 6);

      expect(mktValue).eq(BigNumber.from(2).mul(price));
    });
  });

  describe('#getPriceX128', () => {
    it('gives value between 0.8 and 1.2', async () => {
      const priceX128 = await gmxYieldStrategy.getPriceX128();
      const number = await priceX128ToPrice(priceX128, 6, 18); // usdc, asset
      expect(Math.abs(1 - number)).to.be.lessThan(0.2);
    });
  });

  describe('#withdrawToken', () => {
    it('withdraws token and burns shares', async () => {
      await sGLP.connect(whale).approve(gmxYieldStrategy.address, parseEther('2'));
      await gmxYieldStrategy.approve(gmxYieldStrategy.address, ethers.constants.MaxUint256);
      await gmxYieldStrategy.connect(whale).deposit(parseEther('2'), whale.address);

      const tx = gmxYieldStrategy.connect(whale).withdrawToken(addresses.WETH, parseEther('1.5'), 0, whale.address);

      await expect(tx).to.emit(gmxYieldStrategy, 'TokenWithdrawn');
    });

    it('does not withdraw if not enough shares', async () => {
      await sGLP.connect(whale).approve(gmxYieldStrategy.address, parseEther('2'));
      await gmxYieldStrategy.connect(whale).deposit(parseEther('2'), whale.address);

      const tx = gmxYieldStrategy.connect(whale).withdrawToken(addresses.WETH, parseEther('2.1'), 0, whale.address);

      await expect(tx).to.be.reverted;
    });
  });

  describe('#redeemToken', () => {
    it('works');
  });

  describe('compouding rewards and profit', () => {
    it('increases eth rewards, esGMX and multiplier points', () => {
      /**
       * stakes: fGLP (feeGLP)
       * rewards: esGMX
       */
      const stakedGlpTracker = IRewardTracker__factory.connect(
        '0x1addd80e6039594ee970e5872d247bf0414c8903',
        signers[0],
      );
      /**
       * stakes: GMX and esGMX
       * rewards: esGMX
       */
      const stakedGmxTracker = IRewardTracker__factory.connect(
        '0x908c4d94d34924765f1edc22a1dd098397c59dd4',
        signers[0],
      );

      const bonusGmxTracker = IRewardTracker__factory.connect('0x4d268a7d4C16ceB5a606c173Bd974984343fea13', signers[0]);

      const feeGmxTracker = IRewardTracker__factory.connect('0xd2D1162512F927a7e282Ef43a362659E4F2a728F', signers[0]);
      const feeGlpTracker = IRewardTracker__factory.connect('0xd2D1162512F927a7e282Ef43a362659E4F2a728F', signers[0]);

      // claim esGMX from both trackers
      // staking claimed esGMX
      // claim multiplier points (bnGMX) from bonusGmxTracker
      // stake multiplier points (bnGMX)
    });
  });
});
