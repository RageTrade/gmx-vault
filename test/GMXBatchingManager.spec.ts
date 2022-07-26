import { FakeContract } from '@defi-wonderland/smock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { parseTokenAmount, slippageToSqrtPriceLimit } from '@ragetrade/sdk';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import { ERC20, GMXBatchingManager, GmxVaultMock, GMXYieldStrategy } from '../typechain-types';
import addresses, { GMX_ECOSYSTEM_ADDRESSES } from './fixtures/addresses';
import { gmxBatchingManagerFixture } from './fixtures/gmx-batching-manager';
import { unlockWhales } from './utils/curve-helper';
import { activateMainnetFork, deactivateMainnetFork } from './utils/mainnet-fork';
import { increaseBlockTimestamp } from './utils/vault-helpers';

describe('GMX Batching Manager', () => {
  let admin: SignerWithAddress;
  let vault: GmxVaultMock;
  let keeper: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let usdc: ERC20;
  let fsGlp: ERC20;
  let sGlp: ERC20;
  let gmxBatchingManager: GMXBatchingManager;
  before(async () => {
    await activateMainnetFork({ blockNumber: 18099162 });
    await gmxBatchingManagerFixture();
  });
  beforeEach(async () => {
    ({ admin, vault, user1, user2, keeper, usdc, fsGlp, sGlp, gmxBatchingManager } = await gmxBatchingManagerFixture());
  });
  after(async () => {
    // deploys contracts once
    await deactivateMainnetFork();
  });
  describe('Start State', () => {
    it('initialized state', async () => {
      expect(await gmxBatchingManager.currentRound()).to.eq(1);
      expect(await gmxBatchingManager.keeper()).to.eq(keeper.address);
      expect(await gmxBatchingManager.gmxVault()).to.eq(vault.address);

      // expect(await sGlp.allowance(gmxBatchingManager.address, GMX_ECOSYSTEM_ADDRESSES.RewardRouter)).to.eq(
      //   2n ** 256n - 1n,
      // );
      expect(await sGlp.allowance(gmxBatchingManager.address, vault.address)).to.eq(2n ** 256n - 1n);
    });
  });
  describe('Deposit', () => {
    it('Fails - Token Address 0', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(
        gmxBatchingManager.connect(user1).depositToken(ethers.constants.AddressZero, depositAmount, user1.address),
      ).to.be.revertedWith('InvalidInput(32)');
    });
    it('Fails - Amount 0', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(gmxBatchingManager.connect(user1).depositToken(usdc.address, 0, user1.address)).to.be.revertedWith(
        'InvalidInput(33)',
      );
    });
    it('Fails - Receiver Address 0', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(
        gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, ethers.constants.AddressZero),
      ).to.be.revertedWith('InvalidInput(34)');
    });
    it('Single User Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(() =>
        gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user1.address),
      ).to.changeTokenBalance(usdc, user1, depositAmount.mul(-1n));

      const user1Deposit = await gmxBatchingManager.userDeposits(user1.address);
      // console.log(user1Deposit);
      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.glpBalance).to.eq(await fsGlp.balanceOf(gmxBatchingManager.address));
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(await gmxBatchingManager.roundGlpBalance()).to.eq(user1Deposit.glpBalance);
      expect(await fsGlp.balanceOf(gmxBatchingManager.address)).to.eq(user1Deposit.glpBalance);
    });

    it('Single User Deposit To Receiver', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(() =>
        gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user2.address),
      ).to.changeTokenBalance(usdc, user1, depositAmount.mul(-1n));

      const user1Deposit = await gmxBatchingManager.userDeposits(user1.address);
      const user2Deposit = await gmxBatchingManager.userDeposits(user2.address);
      // console.log(user1Deposit);
      expect(user1Deposit.round).to.eq(0);
      expect(user1Deposit.glpBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.glpBalance).to.eq(await fsGlp.balanceOf(gmxBatchingManager.address));
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await gmxBatchingManager.roundGlpBalance()).to.eq(user2Deposit.glpBalance);
      expect(await fsGlp.balanceOf(gmxBatchingManager.address)).to.eq(user2Deposit.glpBalance);
    });

    it('Single Vault Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(() => vault.depositToken(usdc.address, depositAmount)).to.changeTokenBalance(
        usdc,
        vault,
        depositAmount.mul(-1n),
      );

      const vaultDeposit = await gmxBatchingManager.userDeposits(vault.address);
      // console.log(vaultDeposit);
      expect(vaultDeposit.round).to.eq(0);
      expect(vaultDeposit.glpBalance).to.eq(await fsGlp.balanceOf(gmxBatchingManager.address));
      expect(vaultDeposit.unclaimedShares).to.eq(0);

      expect(await gmxBatchingManager.roundGlpBalance()).to.eq(0);
      expect(await fsGlp.balanceOf(gmxBatchingManager.address)).to.eq(vaultDeposit.glpBalance);
    });

    it('Multiple User & Vault Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(() =>
        gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user1.address),
      ).to.changeTokenBalance(usdc, user1, depositAmount.mul(-1n));

      const balanceAfterUser1Deposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await expect(() => vault.depositToken(usdc.address, depositAmount)).to.changeTokenBalance(
        usdc,
        vault,
        depositAmount.mul(-1n),
      );

      const balanceAfterVaultDeposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await expect(() =>
        gmxBatchingManager.connect(user2).depositToken(usdc.address, depositAmount, user2.address),
      ).to.changeTokenBalance(usdc, user2, depositAmount.mul(-1n));

      const balanceAfterUser2Deposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      const vaultDeposit = await gmxBatchingManager.userDeposits(vault.address);

      const user1Deposit = await gmxBatchingManager.userDeposits(user1.address);

      const user2Deposit = await gmxBatchingManager.userDeposits(user1.address);
      // console.log(user2Deposit);

      // console.log(user1Deposit);
      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.glpBalance).to.eq(balanceAfterUser1Deposit);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      // console.log(vaultDeposit);
      expect(vaultDeposit.round).to.eq(0);
      expect(vaultDeposit.glpBalance).to.eq(balanceAfterVaultDeposit.sub(balanceAfterUser1Deposit));
      expect(vaultDeposit.unclaimedShares).to.eq(0);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.glpBalance).to.eq(balanceAfterUser2Deposit.sub(balanceAfterVaultDeposit));
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await gmxBatchingManager.roundGlpBalance()).to.eq(
        balanceAfterUser2Deposit.sub(balanceAfterVaultDeposit).add(balanceAfterUser1Deposit),
      );
      expect(await fsGlp.balanceOf(gmxBatchingManager.address)).to.eq(balanceAfterUser2Deposit);
    });
  });

  describe('Execute Batch Deposit', () => {
    it('Single User Batch Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user1.address);

      await increaseBlockTimestamp(15 * 60); //15 mins

      const roundGlpBalance = await gmxBatchingManager.roundGlpBalance();
      //Check sGlp transfer and vault share transfer
      await expect(() => gmxBatchingManager.connect(keeper).executeBatchDeposit()).to.changeTokenBalances(
        fsGlp,
        [gmxBatchingManager, vault],
        [roundGlpBalance.mul(-1), roundGlpBalance],
      );

      expect(await vault.balanceOf(gmxBatchingManager.address)).to.eq(roundGlpBalance);

      const user1Deposit = await gmxBatchingManager.userDeposits(user1.address);
      const round1Deposit = await gmxBatchingManager.roundDeposits(1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await gmxBatchingManager.currentRound()).to.eq(2);
      expect(await gmxBatchingManager.roundGlpBalance()).to.eq(0);

      expect(round1Deposit.totalGlp).to.eq(roundGlpBalance);
      expect(round1Deposit.totalShares).to.eq(roundGlpBalance);
    });

    it('Vault User Batch Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await vault.depositToken(usdc.address, depositAmount);

      await increaseBlockTimestamp(15 * 60); //15 mins

      const vaultBalanceBefore = await gmxBatchingManager.userDeposits(vault.address);
      //Check sGlp transfer and vault share transfer
      await expect(() => gmxBatchingManager.connect(keeper).executeBatchDeposit()).to.changeTokenBalances(
        fsGlp,
        [gmxBatchingManager, vault],
        [vaultBalanceBefore.glpBalance.mul(-1), vaultBalanceBefore.glpBalance],
      );
      const vaultBalance = await gmxBatchingManager.userDeposits(vault.address);
      expect(vaultBalance.glpBalance).to.eq(0);

      expect(await vault.balanceOf(gmxBatchingManager.address)).to.eq(0);

      expect(await gmxBatchingManager.currentRound()).to.eq(1);
      expect(await gmxBatchingManager.roundGlpBalance()).to.eq(0);
    });

    it('Multiple User & Vault Batch Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(() =>
        gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user1.address),
      ).to.changeTokenBalance(usdc, user1, depositAmount.mul(-1n));

      const balanceAfterUser1Deposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await expect(() => vault.depositToken(usdc.address, depositAmount)).to.changeTokenBalance(
        usdc,
        vault,
        depositAmount.mul(-1n),
      );

      const balanceAfterVaultDeposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await expect(() =>
        gmxBatchingManager.connect(user2).depositToken(usdc.address, depositAmount, user2.address),
      ).to.changeTokenBalance(usdc, user2, depositAmount.mul(-1n));

      const balanceAfterUser2Deposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await increaseBlockTimestamp(15 * 60); //15 mins

      //Check sGlp transfer and vault share transfer
      await expect(() => gmxBatchingManager.connect(keeper).executeBatchDeposit()).to.changeTokenBalances(
        fsGlp,
        [gmxBatchingManager, vault],
        [balanceAfterUser2Deposit.mul(-1), balanceAfterUser2Deposit],
      );

      const user1Deposit = await gmxBatchingManager.userDeposits(user1.address);
      const vaultBalance = await gmxBatchingManager.userDeposits(vault.address);
      const user2Deposit = await gmxBatchingManager.userDeposits(user2.address);

      const round1Deposit = await gmxBatchingManager.roundDeposits(1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(vaultBalance.glpBalance).to.eq(0);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.unclaimedShares).to.eq(0);

      const totalUserGlp = balanceAfterUser2Deposit.sub(balanceAfterVaultDeposit).add(balanceAfterUser1Deposit);
      expect(round1Deposit.totalGlp).to.eq(totalUserGlp);
      expect(round1Deposit.totalShares).to.eq(totalUserGlp);

      expect(await vault.balanceOf(gmxBatchingManager.address)).to.eq(totalUserGlp);

      expect(await gmxBatchingManager.currentRound()).to.eq(2);
      expect(await gmxBatchingManager.roundGlpBalance()).to.eq(0);
    });

    it('Single User Multiple Round Batch Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user1.address);

      await increaseBlockTimestamp(15 * 60); //15 mins

      const round1GlpBalance = await gmxBatchingManager.roundGlpBalance();
      //Check sGlp transfer and vault share transfer
      await expect(() => gmxBatchingManager.connect(keeper).executeBatchDeposit()).to.changeTokenBalances(
        fsGlp,
        [gmxBatchingManager, vault],
        [round1GlpBalance.mul(-1), round1GlpBalance],
      );

      await gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user1.address);

      await increaseBlockTimestamp(15 * 60); //15 mins

      const round2GlpBalance = await gmxBatchingManager.roundGlpBalance();
      //Check sGlp transfer and vault share transfer
      await expect(() => gmxBatchingManager.connect(keeper).executeBatchDeposit()).to.changeTokenBalances(
        fsGlp,
        [gmxBatchingManager, vault],
        [round2GlpBalance.mul(-1), round2GlpBalance],
      );

      expect(await vault.balanceOf(gmxBatchingManager.address)).to.eq(round1GlpBalance.add(round2GlpBalance));

      const user1Deposit = await gmxBatchingManager.userDeposits(user1.address);
      const round1Deposit = await gmxBatchingManager.roundDeposits(1);
      const round2Deposit = await gmxBatchingManager.roundDeposits(2);

      expect(user1Deposit.round).to.eq(2);
      expect(user1Deposit.glpBalance).to.eq(round2GlpBalance);
      expect(user1Deposit.unclaimedShares).to.eq(round1GlpBalance);
      expect(await gmxBatchingManager.currentRound()).to.eq(3);
      expect(await gmxBatchingManager.roundGlpBalance()).to.eq(0);

      expect(round1Deposit.totalGlp).to.eq(round1GlpBalance);
      expect(round1Deposit.totalShares).to.eq(round1GlpBalance);
      expect(round2Deposit.totalGlp).to.eq(round2GlpBalance);
      expect(round2Deposit.totalShares).to.eq(round2GlpBalance);
    });
  });

  describe('Claim', () => {
    it('Fails - Receiver Address 0', async () => {
      const claimAmount = parseTokenAmount(100n, 6);

      await expect(
        gmxBatchingManager.connect(user1).claim(ethers.constants.AddressZero, claimAmount),
      ).to.be.revertedWith('InvalidInput(16)');
    });
    it('Fails - Amount 0', async () => {
      await expect(gmxBatchingManager.connect(user1).claim(user1.address, 0)).to.be.revertedWith('InvalidInput(17)');
    });
    it('Single User Claim', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user1.address);

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).pauseDeposit();

      expect(await gmxBatchingManager.paused()).to.be.true;

      await gmxBatchingManager.executeBatchDeposit();

      const roundDeposit = await gmxBatchingManager.roundDeposits(1);

      await expect(() =>
        gmxBatchingManager.connect(user1).claim(user1.address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        vault,
        [gmxBatchingManager, user1],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await gmxBatchingManager.userDeposits(user1.address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.glpBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await gmxBatchingManager.paused()).to.be.false;
    });

    it('Single User Claim To Receiver', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user1.address);

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).pauseDeposit();

      expect(await gmxBatchingManager.paused()).to.be.true;

      await gmxBatchingManager.executeBatchDeposit();

      const roundDeposit = await gmxBatchingManager.roundDeposits(1);

      await expect(() =>
        gmxBatchingManager.connect(user1).claim(user2.address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        vault,
        [gmxBatchingManager, user2],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await gmxBatchingManager.userDeposits(user1.address);
      const user2Deposit = await gmxBatchingManager.userDeposits(user2.address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.glpBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(user2Deposit.round).to.eq(0);
      expect(user2Deposit.glpBalance).to.eq(0);
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await gmxBatchingManager.paused()).to.be.false;
    });

    it('Partial Single User Claim', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user1.address);

      const user1Share = await fsGlp.balanceOf(gmxBatchingManager.address);

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).executeBatchDeposit();

      const shareAmountWithdrawn = user1Share.div(5);
      await expect(() =>
        gmxBatchingManager.connect(user1).claim(user1.address, shareAmountWithdrawn),
      ).to.changeTokenBalances(
        vault,
        [gmxBatchingManager, user1],
        [shareAmountWithdrawn.mul(-1), shareAmountWithdrawn],
      );

      const user1Deposit = await gmxBatchingManager.userDeposits(user1.address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.glpBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(user1Share.sub(shareAmountWithdrawn));
    });

    it('Multiple User Claim', async () => {
      const user1DepositAmount = parseTokenAmount(100n, 6);
      const user2DepositAmount = parseTokenAmount(2n * 100n, 6);

      await gmxBatchingManager.connect(user1).depositToken(usdc.address, user1DepositAmount, user1.address);

      const user1Share = await fsGlp.balanceOf(gmxBatchingManager.address);

      await gmxBatchingManager.connect(user2).depositToken(usdc.address, user2DepositAmount, user2.address);

      const user2Share = (await fsGlp.balanceOf(gmxBatchingManager.address)).sub(user1Share);

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).executeBatchDeposit();

      await expect(() => gmxBatchingManager.connect(user1).claim(user1.address, user1Share)).to.changeTokenBalances(
        vault,
        [gmxBatchingManager, user1],
        [user1Share.mul(-1), user1Share],
      );

      await expect(() => gmxBatchingManager.connect(user2).claim(user2.address, user2Share)).to.changeTokenBalances(
        vault,
        [gmxBatchingManager, user2],
        [user2Share.mul(-1), user2Share],
      );

      const user1Deposit = await gmxBatchingManager.userDeposits(user1.address);
      const user2Deposit = await gmxBatchingManager.userDeposits(user2.address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.glpBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.glpBalance).to.eq(0);
      expect(user2Deposit.unclaimedShares).to.eq(0);
    });

    it('Single User Multiple Round Claim', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user1.address);

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).executeBatchDeposit();

      await gmxBatchingManager.connect(user1).depositToken(usdc.address, depositAmount, user1.address);

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).executeBatchDeposit();

      const round1Deposit = await gmxBatchingManager.roundDeposits(1);
      const round2Deposit = await gmxBatchingManager.roundDeposits(2);

      const totalShares = round1Deposit.totalShares.add(round2Deposit.totalShares);

      await expect(() => gmxBatchingManager.connect(user1).claim(user1.address, totalShares)).to.changeTokenBalances(
        vault,
        [gmxBatchingManager, user1],
        [totalShares.mul(-1), totalShares],
      );

      const user1Deposit = await gmxBatchingManager.userDeposits(user1.address);

      expect(user1Deposit.round).to.eq(2);
      expect(user1Deposit.glpBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);
    });
  });

  describe('Pause Unpause', () => {
    it('Pause Deposit', async () => {
      await gmxBatchingManager.connect(keeper).pauseDeposit();
      expect(await gmxBatchingManager.paused()).to.be.true;
    });

    it('Unpause Deposit', async () => {
      await gmxBatchingManager.connect(keeper).pauseDeposit();
      await gmxBatchingManager.connect(keeper).unpauseDeposit();
      expect(await gmxBatchingManager.paused()).to.be.false;
    });

    it('Pause Deposit Fails (Called Not Keeper)', async () => {
      expect(gmxBatchingManager.pauseDeposit()).to.be.revertedWith('CalledNotKeeper()');
    });

    it('Unpause Deposit Fails (Called Not Keeper)', async () => {
      expect(gmxBatchingManager.unpauseDeposit()).to.be.revertedWith('CalledNotKeeper()');
    });

    it('Pause Deposit Fails (Already Paused)', async () => {
      await gmxBatchingManager.connect(keeper).pauseDeposit();
      expect(gmxBatchingManager.pauseDeposit()).to.be.revertedWith('Pausable: paused');
    });

    it('Unpause Deposit Fails (Already Unpaused)', async () => {
      expect(gmxBatchingManager.unpauseDeposit()).to.be.revertedWith('Pausable: not paused');
    });
  });

  describe('Keeper', () => {
    it('Set Keeper Fails - Not Owner', async () => {
      expect(gmxBatchingManager.connect(user1.address).setKeeper(user1.address)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('Set Keeper', async () => {
      await gmxBatchingManager.setKeeper(user1.address);
      expect(await gmxBatchingManager.keeper()).to.eq(user1.address);
    });
  });
});
