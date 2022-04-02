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

      const [admin] = await hre.ethers.getSigners();

      await asset.mint(admin.address, 20);
      await asset.approve(baseVaultTest.address, 20);

      await baseVaultTest.deposit(9, ethers.constants.AddressZero); // success
      await expect(baseVaultTest.deposit(2, ethers.constants.AddressZero)).to.be.reverted;
    });
  });

  describe('Keeper calls', () => {
    it('should only allow owner to set keeper', async () => {
      const { baseVaultTest } = await baseVaultFixture();

      const [admin, other, keeper] = await hre.ethers.getSigners();
      await expect(baseVaultTest.connect(other).setKeeper(keeper.address)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );

      // should success
      await baseVaultTest.connect(admin).setKeeper(keeper.address);
      expect(await baseVaultTest.keeper()).to.eq(keeper.address);
    });

    it('should only allow keeper to execute rebalance and closeTokenPosition', async () => {
      const { baseVaultTest } = await baseVaultFixture();

      const [, , keeper] = await hre.ethers.getSigners();
      await baseVaultTest.setKeeper(keeper.address);

      // when someone else calls, it should revert
      await expect(baseVaultTest.rebalance()).to.be.revertedWith(
        'BV_OnlyKeeperAllowed("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")',
      );
      await expect(baseVaultTest.closeTokenPosition()).to.be.revertedWith(
        'BV_OnlyKeeperAllowed("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")',
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
});
