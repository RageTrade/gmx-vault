import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { baseVaultFixture } from './fixtures/base-vault';

describe('Base Vault', () => {
  before(async () => {
    await baseVaultFixture();
  });

  describe('Deposit Cap', () => {
    it('should only allow owner to set deposit cap', async () => {
      const { baseVaultTest } = await baseVaultFixture();

      expect(await baseVaultTest.depositCap()).to.eq(0, 'deposit cap should be 0 initially');

      await baseVaultTest.updateDepositCap(1);
      expect(await baseVaultTest.depositCap()).to.eq(1, 'deposit cap should be 1 now');

      const [, other] = await hre.ethers.getSigners();
      await expect(baseVaultTest.connect(other).updateDepositCap(1)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('should not allow to deposit more than deposit cap', async () => {
      const { baseVaultTest, asset } = await baseVaultFixture();

      await baseVaultTest.updateDepositCap(10);

      const [admin, user] = await hre.ethers.getSigners();

      await asset.mint(admin.address, 20);
      await asset.approve(baseVaultTest.address, 20);

      await baseVaultTest.deposit(9, admin.address); // success
      await expect(baseVaultTest.deposit(2, admin.address)).to.be.reverted;
    });
  });

  describe('Keeper calls', () => {
    it('should only allow owner to set keeper', async () => {
      const { baseVaultTest } = await baseVaultFixture();

      const [admin, other, keeper, keeperNew] = await hre.ethers.getSigners();
      await expect(baseVaultTest.connect(other).setKeeper(keeperNew.address)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );

      // keeperNew should not be set
      expect(await baseVaultTest.keeper()).to.eq(keeper.address);
    });

    it('should only allow keeper to execute rebalance and closeTokenPosition', async () => {
      const { baseVaultTest, admin, keeper } = await baseVaultFixture();

      // when someone else calls, it should revert
      await expect(baseVaultTest.rebalance()).to.be.revertedWith(
        `BV_OnlyKeeperAllowed("${admin.address}", "${keeper.address}")`,
      );
      await expect(baseVaultTest.closeTokenPosition()).to.be.revertedWith(
        `BV_OnlyKeeperAllowed("${admin.address}", "${keeper.address}")`,
      );

      // when keeper calls, this should not cause BV_OnlyKeeperAllowed revert

      let rebalanceError = '';
      try {
        await baseVaultTest.connect(keeper).rebalance();
      } catch (e) {
        rebalanceError = (e as any).message;
      }
      expect(rebalanceError.includes('BV_OnlyKeeperAllowed')).to.be.false;

      let closeTokenPositionError = '';
      try {
        await baseVaultTest.connect(keeper).closeTokenPosition();
      } catch (e) {
        closeTokenPositionError = (e as any).message;
      }
      expect(closeTokenPositionError.includes('BV_OnlyKeeperAllowed')).to.be.false;
    });
  });

  describe('RebalanceTimeThreshold', () => {
    it('should only allow owner to set rebalance time threshold', async () => {
      const { baseVaultTest } = await baseVaultFixture();

      expect(await baseVaultTest.rebalanceTimeThreshold()).to.eq(
        24 * 60 * 60,
        'rebalance time threshold should be 1 days initially',
      );

      await baseVaultTest.setRebalanceThreshold(1, 0);
      expect(await baseVaultTest.rebalanceTimeThreshold()).to.eq(1, 'rebalance time threshold should be 1 now');

      const [, other] = await hre.ethers.getSigners();
      await expect(baseVaultTest.connect(other).setRebalanceThreshold(1, 0)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('should not allow to rebalance before rebalance time threshold', async () => {
      const { baseVaultTest, keeper } = await baseVaultFixture();

      await baseVaultTest.setRebalanceThreshold(10, 0);

      const [admin] = await hre.ethers.getSigners();

      // making first rebalance, updating the rebalanceTimeLast
      await baseVaultTest.connect(keeper).rebalance();

      expect(await baseVaultTest.isValidRebalanceTime()).to.be.false;

      await baseVaultTest.setBlockTimestamp(Math.floor(Date.now() / 1000) + 24 * 60 * 60 + 1);

      expect(await baseVaultTest.isValidRebalanceTime()).to.be.true;
    });
  });
});
