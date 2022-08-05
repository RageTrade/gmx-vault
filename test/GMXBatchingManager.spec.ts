import { FakeContract } from '@defi-wonderland/smock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { parseTokenAmount, slippageToSqrtPriceLimit } from '@ragetrade/sdk';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import {
  ERC20,
  GMXBatchingManager,
  GmxVaultMock,
  GMXYieldStrategy,
  IRewardRouterV2__factory,
  IVault,
  IVault__factory,
} from '../typechain-types';
import addresses, { GMX_ECOSYSTEM_ADDRESSES } from './fixtures/addresses';
import { gmxBatchingManagerFixture } from './fixtures/gmx-batching-manager';
import { unlockWhales } from './utils/curve-helper';
import { activateMainnetFork, deactivateMainnetFork } from './utils/mainnet-fork';
import { increaseBlockTimestamp } from './utils/vault-helpers';

describe('GMX Batching Manager', () => {
  let admin: SignerWithAddress;
  let vault: GmxVaultMock;
  let vault1: GmxVaultMock;
  let stakingManager: GmxVaultMock;
  let keeper: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let usdc: ERC20;
  let weth: ERC20;
  let fsGlp: ERC20;
  let sGlp: ERC20;
  let gmxBatchingManager: GMXBatchingManager;
  before(async () => {
    await activateMainnetFork({ blockNumber: 18099162 });
    await gmxBatchingManagerFixture();
  });
  beforeEach(async () => {
    ({ admin, vault, vault1, user1, user2, keeper, usdc, fsGlp, sGlp, stakingManager, gmxBatchingManager, weth } =
      await gmxBatchingManagerFixture());
  });
  after(async () => {
    // deploys contracts once
    await deactivateMainnetFork();
  });
  describe('Start State', () => {
    it('initialized state', async () => {
      expect(await gmxBatchingManager.currentRound(vault.address)).to.eq(1);
      expect(await gmxBatchingManager.keeper()).to.eq(keeper.address);
      expect(await gmxBatchingManager.isVaultValid(vault.address)).to.be.true;

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
        gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            ethers.constants.AddressZero,
            depositAmount,
            0,
            user1.address,
          ),
      ).to.be.revertedWith('InvalidInput(32)');
    });
    it('Fails - Amount 0', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(
        gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](vault.address, usdc.address, 0, 0, user1.address),
      ).to.be.revertedWith('InvalidInput(33)');
    });
    it('Fails - Receiver Address 0', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(
        gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            usdc.address,
            depositAmount,
            0,
            ethers.constants.AddressZero,
          ),
      ).to.be.revertedWith('InvalidInput(34)');
    });
    it('Fails - Invalid Vault', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(
        gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            user1.address,
            usdc.address,
            depositAmount,
            0,
            user1.address,
          ),
      ).to.be.revertedWith(`'InvalidVault("${user1.address}")`);
    });
    it('Single User Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(() =>
        gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            usdc.address,
            depositAmount,
            0,
            user1.address,
          ),
      ).to.changeTokenBalance(usdc, user1, depositAmount.mul(-1n));

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      // console.log(user1Deposit);
      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.glpBalance).to.eq(await fsGlp.balanceOf(gmxBatchingManager.address));
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(user1Deposit.glpBalance);
      expect(await fsGlp.balanceOf(gmxBatchingManager.address)).to.eq(user1Deposit.glpBalance);
    });

    it('Single User Deposit To Receiver', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(() =>
        gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            usdc.address,
            depositAmount,
            0,
            user2.address,
          ),
      ).to.changeTokenBalance(usdc, user1, depositAmount.mul(-1n));

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      const user2Deposit = await gmxBatchingManager.userDeposits(vault.address, user2.address);
      // console.log(user1Deposit);
      expect(user1Deposit.round).to.eq(0);
      expect(user1Deposit.glpBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.glpBalance).to.eq(await fsGlp.balanceOf(gmxBatchingManager.address));
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(user2Deposit.glpBalance);
      expect(await fsGlp.balanceOf(gmxBatchingManager.address)).to.eq(user2Deposit.glpBalance);
    });

    it('Single Vault Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(stakingManager.depositToken(ethers.constants.AddressZero, depositAmount, 0)).to.be.revertedWith(
        'InvalidInput(48)',
      );
      await expect(stakingManager.depositToken(usdc.address, 0, 0)).to.be.revertedWith('InvalidInput(49)');
      await expect(
        gmxBatchingManager.connect(user1)['depositToken(address,uint256,uint256)'](usdc.address, depositAmount, 0),
      ).to.be.revertedWith('CallerNotStakingManager()');

      await expect(() => stakingManager.depositToken(usdc.address, depositAmount, 0)).to.changeTokenBalance(
        usdc,
        stakingManager,
        depositAmount.mul(-1n),
      );

      const vaultDeposit = await gmxBatchingManager.stakingManagerGlpBalance();
      // console.log(vaultDeposit);
      expect(vaultDeposit).to.eq(await fsGlp.balanceOf(gmxBatchingManager.address));

      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(0);
      expect(await fsGlp.balanceOf(gmxBatchingManager.address)).to.eq(vaultDeposit);
    });

    it('Multiple User & Vault Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(() =>
        gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            usdc.address,
            depositAmount,
            0,
            user1.address,
          ),
      ).to.changeTokenBalance(usdc, user1, depositAmount.mul(-1n));

      const balanceAfterUser1Deposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await expect(() => stakingManager.depositToken(usdc.address, depositAmount, 0)).to.changeTokenBalance(
        usdc,
        stakingManager,
        depositAmount.mul(-1n),
      );

      const balanceAfterVaultDeposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await expect(() =>
        gmxBatchingManager
          .connect(user2)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            usdc.address,
            depositAmount,
            0,
            user2.address,
          ),
      ).to.changeTokenBalance(usdc, user2, depositAmount.mul(-1n));

      const balanceAfterUser2Deposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      const vaultDeposit = await gmxBatchingManager.stakingManagerGlpBalance();

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);

      const user2Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      // console.log(user2Deposit);

      // console.log(user1Deposit);
      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.glpBalance).to.eq(balanceAfterUser1Deposit);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      // console.log(vaultDeposit);
      expect(vaultDeposit).to.eq(balanceAfterVaultDeposit.sub(balanceAfterUser1Deposit));

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.glpBalance).to.eq(balanceAfterUser2Deposit.sub(balanceAfterVaultDeposit));
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(
        balanceAfterUser2Deposit.sub(balanceAfterVaultDeposit).add(balanceAfterUser1Deposit),
      );
      expect(await fsGlp.balanceOf(gmxBatchingManager.address)).to.eq(balanceAfterUser2Deposit);
    });
  });

  describe('Execute Batch Deposit', () => {
    it('Single User Batch Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          depositAmount,
          0,
          user1.address,
        );

      await increaseBlockTimestamp(15 * 60); //15 mins

      const roundGlpBalance = await gmxBatchingManager.roundGlpBalance(vault.address);
      //Check sGlp transfer and vault share transfer
      await expect(() => gmxBatchingManager.connect(keeper).executeBatchDeposit()).to.changeTokenBalances(
        fsGlp,
        [gmxBatchingManager, vault],
        [roundGlpBalance.mul(-1), roundGlpBalance],
      );

      expect(await vault.balanceOf(gmxBatchingManager.address)).to.eq(roundGlpBalance);

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      const round1Deposit = await gmxBatchingManager.roundDeposits(vault.address, 1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await gmxBatchingManager.currentRound(vault.address)).to.eq(2);
      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(0);

      expect(round1Deposit.totalGlp).to.eq(roundGlpBalance);
      expect(round1Deposit.totalShares).to.eq(roundGlpBalance);
    });

    it('Vault User Batch Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await stakingManager.depositToken(usdc.address, depositAmount, 0);

      await increaseBlockTimestamp(15 * 60); //15 mins

      const stakingManagerBalanceBefore = await gmxBatchingManager.stakingManagerGlpBalance();
      //Check sGlp transfer and vault share transfer
      await expect(() => gmxBatchingManager.connect(keeper).executeBatchDeposit()).to.changeTokenBalances(
        fsGlp,
        [gmxBatchingManager, stakingManager],
        [stakingManagerBalanceBefore.mul(-1), stakingManagerBalanceBefore],
      );
      const vaultBalance = await gmxBatchingManager.stakingManagerGlpBalance();
      expect(vaultBalance).to.eq(0);

      expect(await vault.balanceOf(gmxBatchingManager.address)).to.eq(0);

      expect(await gmxBatchingManager.currentRound(vault.address)).to.eq(1);
      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(0);
    });

    it('Multiple User & Vault Batch Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(() =>
        gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            usdc.address,
            depositAmount,
            0,
            user1.address,
          ),
      ).to.changeTokenBalance(usdc, user1, depositAmount.mul(-1n));

      const balanceAfterUser1Deposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await expect(() => stakingManager.depositToken(usdc.address, depositAmount, 0)).to.changeTokenBalance(
        usdc,
        stakingManager,
        depositAmount.mul(-1n),
      );

      const balanceAfterVaultDeposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await expect(() =>
        gmxBatchingManager
          .connect(user2)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            usdc.address,
            depositAmount,
            0,
            user2.address,
          ),
      ).to.changeTokenBalance(usdc, user2, depositAmount.mul(-1n));

      const balanceAfterUser2Deposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await increaseBlockTimestamp(15 * 60); //15 mins
      const totalUserGlp = balanceAfterUser2Deposit.sub(balanceAfterVaultDeposit).add(balanceAfterUser1Deposit);

      //Check sGlp transfer and vault share transfer
      await expect(() => gmxBatchingManager.connect(keeper).executeBatchDeposit()).to.changeTokenBalances(
        fsGlp,
        [gmxBatchingManager, vault, stakingManager],
        [balanceAfterUser2Deposit.mul(-1), totalUserGlp, balanceAfterVaultDeposit.sub(balanceAfterUser1Deposit)],
      );

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      const vaultBalance = await gmxBatchingManager.stakingManagerGlpBalance();
      const user2Deposit = await gmxBatchingManager.userDeposits(vault.address, user2.address);

      const round1Deposit = await gmxBatchingManager.roundDeposits(vault.address, 1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(vaultBalance).to.eq(0);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(round1Deposit.totalGlp).to.eq(totalUserGlp);
      expect(round1Deposit.totalShares).to.eq(totalUserGlp);

      expect(await vault.balanceOf(gmxBatchingManager.address)).to.eq(totalUserGlp);

      expect(await gmxBatchingManager.currentRound(vault.address)).to.eq(2);
      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(0);
    });

    it('Multiple Vault & Staking Manager Batch Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await expect(() =>
        gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            usdc.address,
            depositAmount,
            0,
            user1.address,
          ),
      ).to.changeTokenBalance(usdc, user1, depositAmount.mul(-1n));

      const balanceAfterUser1Deposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await expect(() => stakingManager.depositToken(usdc.address, depositAmount, 0)).to.changeTokenBalance(
        usdc,
        stakingManager,
        depositAmount.mul(-1n),
      );

      const balanceAfterVaultDeposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await expect(() =>
        gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault1.address,
            usdc.address,
            depositAmount,
            0,
            user1.address,
          ),
      ).to.changeTokenBalance(usdc, user1, depositAmount.mul(-1n));

      const balanceAfterUser2Deposit = await fsGlp.balanceOf(gmxBatchingManager.address);

      await increaseBlockTimestamp(15 * 60); //15 mins
      const totalUserGlp = balanceAfterUser2Deposit.sub(balanceAfterVaultDeposit).add(balanceAfterUser1Deposit);
      const vaultGlp = balanceAfterUser1Deposit;
      const vault1Glp = balanceAfterUser2Deposit.sub(balanceAfterVaultDeposit);

      //Check sGlp transfer and vault share transfer
      await expect(() => gmxBatchingManager.connect(keeper).executeBatchDeposit()).to.changeTokenBalances(
        fsGlp,
        [gmxBatchingManager, vault, vault1, stakingManager],
        [balanceAfterUser2Deposit.mul(-1), vaultGlp, vault1Glp, balanceAfterVaultDeposit.sub(balanceAfterUser1Deposit)],
      );

      const vaultDeposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      const vaultBalance = await gmxBatchingManager.stakingManagerGlpBalance();
      const vault1Deposit = await gmxBatchingManager.userDeposits(vault1.address, user1.address);

      const round1VaultDeposit = await gmxBatchingManager.roundDeposits(vault.address, 1);
      const round1Vault1Deposit = await gmxBatchingManager.roundDeposits(vault1.address, 1);

      expect(vaultDeposit.round).to.eq(1);
      expect(vaultDeposit.unclaimedShares).to.eq(0);
      expect(vaultDeposit.glpBalance).to.eq(vaultGlp);

      expect(vaultBalance).to.eq(0);

      expect(vault1Deposit.round).to.eq(1);
      expect(vault1Deposit.unclaimedShares).to.eq(0);
      expect(vault1Deposit.glpBalance).to.eq(vault1Glp);

      expect(round1VaultDeposit.totalGlp).to.eq(vaultGlp);
      expect(round1VaultDeposit.totalShares).to.eq(vaultGlp);
      expect(round1Vault1Deposit.totalGlp).to.eq(vault1Glp);
      expect(round1Vault1Deposit.totalShares).to.eq(vault1Glp);

      expect(await vault.balanceOf(gmxBatchingManager.address)).to.eq(vaultGlp);
      expect(await vault1.balanceOf(gmxBatchingManager.address)).to.eq(vault1Glp);

      expect(await gmxBatchingManager.currentRound(vault.address)).to.eq(2);
      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(0);
      expect(await gmxBatchingManager.currentRound(vault1.address)).to.eq(2);
      expect(await gmxBatchingManager.roundGlpBalance(vault1.address)).to.eq(0);
    });

    it('Single User Multiple Round Batch Deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          depositAmount,
          0,
          user1.address,
        );

      await increaseBlockTimestamp(15 * 60); //15 mins

      const round1GlpBalance = await gmxBatchingManager.roundGlpBalance(vault.address);
      //Check sGlp transfer and vault share transfer
      await expect(() => gmxBatchingManager.connect(keeper).executeBatchDeposit()).to.changeTokenBalances(
        fsGlp,
        [gmxBatchingManager, vault],
        [round1GlpBalance.mul(-1), round1GlpBalance],
      );

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          depositAmount,
          0,
          user1.address,
        );

      await increaseBlockTimestamp(15 * 60); //15 mins

      const round2GlpBalance = await gmxBatchingManager.roundGlpBalance(vault.address);
      //Check sGlp transfer and vault share transfer
      await expect(() => gmxBatchingManager.connect(keeper).executeBatchDeposit()).to.changeTokenBalances(
        fsGlp,
        [gmxBatchingManager, vault],
        [round2GlpBalance.mul(-1), round2GlpBalance],
      );

      expect(await vault.balanceOf(gmxBatchingManager.address)).to.eq(round1GlpBalance.add(round2GlpBalance));

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      const round1Deposit = await gmxBatchingManager.roundDeposits(vault.address, 1);
      const round2Deposit = await gmxBatchingManager.roundDeposits(vault.address, 2);

      expect(user1Deposit.round).to.eq(2);
      expect(user1Deposit.glpBalance).to.eq(round2GlpBalance);
      expect(user1Deposit.unclaimedShares).to.eq(round1GlpBalance);
      expect(await gmxBatchingManager.currentRound(vault.address)).to.eq(3);
      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(0);

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
        gmxBatchingManager.connect(user1).claim(vault.address, ethers.constants.AddressZero, claimAmount),
      ).to.be.revertedWith('InvalidInput(16)');
    });
    it('Fails - Amount 0', async () => {
      await expect(gmxBatchingManager.connect(user1).claim(vault.address, user1.address, 0)).to.be.revertedWith(
        'InvalidInput(17)',
      );
    });
    it('Single User Claim', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          depositAmount,
          0,
          user1.address,
        );

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).pauseDeposit();

      expect(await gmxBatchingManager.paused()).to.be.true;

      await gmxBatchingManager.executeBatchDeposit();

      const roundDeposit = await gmxBatchingManager.roundDeposits(vault.address, 1);

      await expect(
        gmxBatchingManager.connect(user1).claim(vault.address, user1.address, roundDeposit.totalShares.add(1)),
      ).to.be.revertedWith(`InsufficientShares(${roundDeposit.totalShares})`);

      await expect(() =>
        gmxBatchingManager.connect(user1).claim(vault.address, user1.address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        vault,
        [gmxBatchingManager, user1],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.glpBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await gmxBatchingManager.paused()).to.be.false;
    });

    it('Single User Claim After another deposit', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          depositAmount,
          0,
          user1.address,
        );

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).pauseDeposit();

      expect(await gmxBatchingManager.paused()).to.be.true;

      await gmxBatchingManager.executeBatchDeposit();

      const balanceBeforeDeposit = await fsGlp.balanceOf(gmxBatchingManager.address);
      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          depositAmount,
          0,
          user1.address,
        );

      const depositGlpAmount = (await fsGlp.balanceOf(gmxBatchingManager.address)).sub(balanceBeforeDeposit);

      const roundDeposit = await gmxBatchingManager.roundDeposits(vault.address, 1);

      await expect(() =>
        gmxBatchingManager.connect(user1).claim(vault.address, user1.address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        vault,
        [gmxBatchingManager, user1],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);

      expect(user1Deposit.round).to.eq(2);
      expect(user1Deposit.glpBalance).to.eq(depositGlpAmount);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await gmxBatchingManager.paused()).to.be.false;
    });

    it('Single User Claim To Receiver', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          depositAmount,
          0,
          user1.address,
        );

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).pauseDeposit();

      expect(await gmxBatchingManager.paused()).to.be.true;

      await gmxBatchingManager.executeBatchDeposit();

      const roundDeposit = await gmxBatchingManager.roundDeposits(vault.address, 1);

      await expect(() =>
        gmxBatchingManager.connect(user1).claim(vault.address, user2.address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        vault,
        [gmxBatchingManager, user2],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      const user2Deposit = await gmxBatchingManager.userDeposits(vault.address, user2.address);

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

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          depositAmount,
          0,
          user1.address,
        );

      const user1Share = await fsGlp.balanceOf(gmxBatchingManager.address);

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).executeBatchDeposit();

      const shareAmountWithdrawn = user1Share.div(5);
      await expect(() =>
        gmxBatchingManager.connect(user1).claim(vault.address, user1.address, shareAmountWithdrawn),
      ).to.changeTokenBalances(
        vault,
        [gmxBatchingManager, user1],
        [shareAmountWithdrawn.mul(-1), shareAmountWithdrawn],
      );

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.glpBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(user1Share.sub(shareAmountWithdrawn));
    });

    it('Multiple User Claim', async () => {
      const user1DepositAmount = parseTokenAmount(100n, 6);
      const user2DepositAmount = parseTokenAmount(2n * 100n, 6);

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          user1DepositAmount,
          0,
          user1.address,
        );

      const user1Share = await fsGlp.balanceOf(gmxBatchingManager.address);

      await gmxBatchingManager
        .connect(user2)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          user2DepositAmount,
          0,
          user2.address,
        );

      const user2Share = (await fsGlp.balanceOf(gmxBatchingManager.address)).sub(user1Share);

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).executeBatchDeposit();

      await expect(() =>
        gmxBatchingManager.connect(user1).claim(vault.address, user1.address, user1Share),
      ).to.changeTokenBalances(vault, [gmxBatchingManager, user1], [user1Share.mul(-1), user1Share]);

      await expect(() =>
        gmxBatchingManager.connect(user2).claim(vault.address, user2.address, user2Share),
      ).to.changeTokenBalances(vault, [gmxBatchingManager, user2], [user2Share.mul(-1), user2Share]);

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      const user2Deposit = await gmxBatchingManager.userDeposits(vault.address, user2.address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.glpBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.glpBalance).to.eq(0);
      expect(user2Deposit.unclaimedShares).to.eq(0);
    });

    it('Multiple Vault Claim', async () => {
      const vaultDepositAmount = parseTokenAmount(100n, 6);
      const vault1DepositAmount = parseTokenAmount(2n * 100n, 6);

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          vaultDepositAmount,
          0,
          user1.address,
        );

      const vaultShare = await fsGlp.balanceOf(gmxBatchingManager.address);

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault1.address,
          usdc.address,
          vault1DepositAmount,
          0,
          user1.address,
        );

      const vault1Share = (await fsGlp.balanceOf(gmxBatchingManager.address)).sub(vaultShare);

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).executeBatchDeposit();

      await expect(() =>
        gmxBatchingManager.connect(user1).claim(vault.address, user1.address, vaultShare),
      ).to.changeTokenBalances(vault, [gmxBatchingManager, user1], [vaultShare.mul(-1), vaultShare]);

      await expect(() =>
        gmxBatchingManager.connect(user1).claim(vault1.address, user1.address, vault1Share),
      ).to.changeTokenBalances(vault1, [gmxBatchingManager, user1], [vault1Share.mul(-1), vault1Share]);

      const vaultDeposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      const vault1Deposit = await gmxBatchingManager.userDeposits(vault1.address, user1.address);

      expect(vaultDeposit.round).to.eq(1);
      expect(vaultDeposit.glpBalance).to.eq(0);
      expect(vaultDeposit.unclaimedShares).to.eq(0);

      expect(vault1Deposit.round).to.eq(1);
      expect(vault1Deposit.glpBalance).to.eq(0);
      expect(vault1Deposit.unclaimedShares).to.eq(0);
    });

    it('Single User Multiple Round Claim', async () => {
      const depositAmount = parseTokenAmount(100n, 6);

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          depositAmount,
          0,
          user1.address,
        );

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).executeBatchDeposit();

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          depositAmount,
          0,
          user1.address,
        );

      await increaseBlockTimestamp(15 * 60); //15 mins

      await gmxBatchingManager.connect(keeper).executeBatchDeposit();

      const round1Deposit = await gmxBatchingManager.roundDeposits(vault.address, 1);
      const round2Deposit = await gmxBatchingManager.roundDeposits(vault.address, 2);

      const totalShares = round1Deposit.totalShares.add(round2Deposit.totalShares);

      await expect(() =>
        gmxBatchingManager.connect(user1).claim(vault.address, user1.address, totalShares),
      ).to.changeTokenBalances(vault, [gmxBatchingManager, user1], [totalShares.mul(-1), totalShares]);

      const user1Deposit = await gmxBatchingManager.userDeposits(vault.address, user1.address);

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

  describe('slippage tolerance', () => {
    it('should fail if tolerance crossed', async () => {
      const gmxVault = IVault__factory.connect(GMX_ECOSYSTEM_ADDRESSES.Vault, user1);

      const slippageThreshold = BigNumber.from(10); // 0.1%
      const PRICE_PRECISION = BigNumber.from(10).pow(30);
      const MAX_BPS = BigNumber.from(10_000);

      const depositAmount = parseTokenAmount(100n, 6);

      const price = await gmxVault.getMinPrice(usdc.address);
      let usdg = depositAmount.mul(price).mul(MAX_BPS.sub(slippageThreshold)).div(MAX_BPS).div(PRICE_PRECISION);

      usdg = usdg.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(6));

      await expect(
        gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            usdc.address,
            depositAmount,
            usdg,
            user1.address,
          ),
      ).to.be.revertedWith(
        `VM Exception while processing transaction: reverted with reason string 'GlpManager: insufficient USDG output'`,
      );
    });
    it('should pass if tolerance not crossed', async () => {
      const gmxVault = IVault__factory.connect(GMX_ECOSYSTEM_ADDRESSES.Vault, user1);

      const slippageThreshold = BigNumber.from(200); // 2%
      const PRICE_PRECISION = BigNumber.from(10).pow(30);
      const MAX_BPS = BigNumber.from(10_000);

      const depositAmount = parseTokenAmount(100n, 6);

      const price = await gmxVault.getMinPrice(usdc.address);
      let usdg = depositAmount.mul(price).mul(MAX_BPS.sub(slippageThreshold)).div(MAX_BPS).div(PRICE_PRECISION);

      usdg = usdg.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(6));

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          usdc.address,
          depositAmount,
          usdg,
          user1.address,
        );
    });
  });

  describe('getters at various states', () => {
    it('currentRound', async () => {
      // current round if vault does not exists
      expect(await gmxBatchingManager.currentRound(user1.address)).to.eq(0);
      // current round if vault exists
      expect(await gmxBatchingManager.currentRound(vault.address)).to.eq(1);
    });

    it('roundGlpBalance', async () => {
      // roundGlpBalance if vault does not exists
      expect(await gmxBatchingManager.roundGlpBalance(user1.address)).to.eq(0);
      // roundGlpBalance if vault exists but no balance exists
      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(0);

      const rewardRouter = IRewardRouterV2__factory.connect(GMX_ECOSYSTEM_ADDRESSES.RewardRouter, user1);
      const filter = rewardRouter.filters.StakeGlp();

      let tx = await (
        await gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            usdc.address,
            parseTokenAmount(100n, 6),
            0,
            user1.address,
          )
      ).wait();
      await increaseBlockTimestamp(15 * 60); //15 mins

      let filtered = await rewardRouter.queryFilter(filter, tx.blockNumber);
      const previousAmount = filtered[0].args.amount;

      // roundGlpBalance if vault and round exists
      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(filtered[0].args.amount);

      // roundGlpBalance on multiple deposits of different tokens and users
      tx = await (
        await gmxBatchingManager
          .connect(user1)
          ['depositToken(address,address,uint256,uint256,address)'](
            vault.address,
            weth.address,
            parseTokenAmount(100n, 6),
            0,
            user1.address,
          )
      ).wait();
      await increaseBlockTimestamp(15 * 60); //15 mins

      filtered = await rewardRouter.queryFilter(filter, tx.blockNumber);

      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(
        filtered[0].args.amount.add(previousAmount),
      );

      // roundGlpBalance after executeBatch
      await gmxBatchingManager.executeBatchDeposit();
      expect(await gmxBatchingManager.roundGlpBalance(vault.address)).to.eq(0);
    });

    it('user state getters', async () => {
      // when vault does not exists
      let userDeposits = await gmxBatchingManager.userDeposits(user1.address, user1.address);
      expect(userDeposits.round).to.eq(0);
      expect(await gmxBatchingManager.glpBalance(vault.address, user1.address)).to.eq(0);
      expect(await gmxBatchingManager.unclaimedShares(vault.address, user1.address)).to.eq(0);

      // when vault exists and user has not deposited
      userDeposits = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      expect(userDeposits.round).to.eq(0);
      expect(await gmxBatchingManager.glpBalance(vault.address, user1.address)).to.eq(0);
      expect(await gmxBatchingManager.unclaimedShares(vault.address, user1.address)).to.eq(0);

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          weth.address,
          parseTokenAmount(100n, 6),
          0,
          user1.address,
        );
      userDeposits = await gmxBatchingManager.userDeposits(vault.address, user1.address);

      const bal = await fsGlp.balanceOf(gmxBatchingManager.address);

      // when vault exists and user has deposited
      userDeposits = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      expect(userDeposits.round).to.eq(1);
      expect(await gmxBatchingManager.glpBalance(vault.address, user1.address)).to.eq(bal);
      expect(await gmxBatchingManager.unclaimedShares(vault.address, user1.address)).to.eq(0);

      await increaseBlockTimestamp(15 * 60); //15 mins
      await gmxBatchingManager.executeBatchDeposit();

      await gmxBatchingManager
        .connect(user1)
        ['depositToken(address,address,uint256,uint256,address)'](
          vault.address,
          weth.address,
          parseTokenAmount(100n, 6),
          0,
          user1.address,
        );

      userDeposits = await gmxBatchingManager.userDeposits(vault.address, user1.address);

      // when user deposits in different round
      userDeposits = await gmxBatchingManager.userDeposits(vault.address, user1.address);
      expect(userDeposits.round).to.eq(2);
      expect(await gmxBatchingManager.glpBalance(vault.address, user1.address)).to.eq(
        await fsGlp.balanceOf(gmxBatchingManager.address),
      );
      expect(await gmxBatchingManager.unclaimedShares(vault.address, user1.address)).to.eq(bal);
    });
  });

  describe('adding and validating vault', () => {
    it('should not add more vaults than limit', async () => {
      for (let i = 0; i < 8; i++) {
        await gmxBatchingManager.addVault(ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.randomBytes(20))));
      }

      await expect(gmxBatchingManager.addVault(user1.address)).to.be.revertedWith(`'VaultsLimitExceeded()'`);
    });
    it('should not add vault if already added', async () => {
      await gmxBatchingManager.addVault(user1.address);
      await expect(gmxBatchingManager.addVault(user1.address)).to.be.revertedWith(`'VaultAlreadyAdded()'`);
    });
  });
});
