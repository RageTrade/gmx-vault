import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import addresses from './fixtures/addresses';
import { unlockWhales } from './utils/curve-helper';
import { vaultPeripheryFixture } from './fixtures/vault-periphery';
import { activateMainnetFork, deactivateMainnetFork } from './utils/mainnet-fork';

describe('Vault Periphery', () => {
  before(async () => {
    await activateMainnetFork({ blockNumber: 9323800 });
    await vaultPeripheryFixture();
  });

  after(async () => {
    await deactivateMainnetFork();
  });

  describe('deposit USDC', () => {
    it('should deposit usdc below tolerance', async () => {
      const [_, user1] = await hre.ethers.getSigners();
      const { vaultPeriphery, usdc, vault, lpOracle } = await vaultPeripheryFixture();
      await unlockWhales();

      const whale = await ethers.getSigner(addresses.USDC_WHALE);
      const amount = BigNumber.from(10).pow(6).mul(35_000);

      await usdc.connect(whale).transfer(user1.address, amount);
      await usdc.connect(user1).approve(vaultPeriphery.address, ethers.constants.MaxUint256);

      await vaultPeriphery.connect(user1).depositUsdc(amount);

      const x = amount
        .mul(BigNumber.from(10).pow(18))
        .mul(BigNumber.from(10).pow(18))
        .div(BigNumber.from(10).pow(6))
        .div(await lpOracle.lp_price());
      const min = x.mul(1000).sub(BigNumber.from(5).mul(x)).div(1000);

      expect(await vault.balanceOf(user1.address)).to.be.gt(min);
    });

    it('should revert on deposit usdc above tolerance', async () => {
      const [_, user1] = await hre.ethers.getSigners();
      const { vaultPeriphery, usdc, vault } = await vaultPeripheryFixture();
      await unlockWhales();

      const whale = await ethers.getSigner(addresses.USDC_WHALE);
      const amount = BigNumber.from(10).pow(6).mul(100_000);

      await usdc.connect(whale).transfer(user1.address, amount);
      await usdc.connect(user1).approve(vaultPeriphery.address, ethers.constants.MaxUint256);

      expect(vaultPeriphery.connect(user1).depositUsdc(amount)).to.be.revertedWith('SlippageToleranceBreached()');
    });

    it('should go through on updating max tolerance', async () => {
      const [admin, user1] = await hre.ethers.getSigners();
      const { vaultPeriphery, usdc, vault, lpOracle } = await vaultPeripheryFixture();
      await unlockWhales();

      const whale = await ethers.getSigner(addresses.USDC_WHALE);
      const amount = BigNumber.from(10).pow(6).mul(100_000);

      await usdc.connect(whale).transfer(user1.address, amount);
      await usdc.connect(user1).approve(vaultPeriphery.address, ethers.constants.MaxUint256);

      await vaultPeriphery.connect(admin).updateTolerance(100);

      await vaultPeriphery.connect(user1).depositUsdc(amount);

      const x = amount
        .mul(BigNumber.from(10).pow(18))
        .mul(BigNumber.from(10).pow(18))
        .div(BigNumber.from(10).pow(6))
        .div(await lpOracle.lp_price());
      const min = x.mul(1000).sub(BigNumber.from(10).mul(x)).div(1000);

      expect(await vault.balanceOf(user1.address)).to.be.gt(min);
    });
  });

  describe('deposit WETH', () => {
    it('should deposit weth below tolerance', async () => {
      const [_, user1] = await hre.ethers.getSigners();
      const { vaultPeriphery, weth, vault, lpOracle, wethOracle } = await vaultPeripheryFixture();
      await unlockWhales();

      const whale = await ethers.getSigner(addresses.WETH_WHALE);
      const amount = BigNumber.from(10).pow(18).mul(55);

      await weth.connect(whale).transfer(user1.address, amount);
      await weth.connect(user1).approve(vaultPeriphery.address, ethers.constants.MaxUint256);

      await vaultPeriphery.connect(user1).depositWeth(amount);

      const wethValue = amount
        .mul((await wethOracle.latestRoundData()).answer)
        .mul(BigNumber.from(10).pow(18))
        .div(BigNumber.from(10).pow(8));
      const lpValue = await lpOracle.lp_price();

      const x = wethValue.div(lpValue);
      const min = x.mul(1000).sub(BigNumber.from(5).mul(x)).div(1000);

      expect(await vault.balanceOf(user1.address)).to.be.gt(min);
    });

    it('should revert on deposit weth above tolerance', async () => {
      const [_, user1] = await hre.ethers.getSigners();
      const { vaultPeriphery, weth, vault } = await vaultPeripheryFixture();
      await unlockWhales();

      const whale = await ethers.getSigner(addresses.WETH_WHALE);
      const amount = BigNumber.from(10).pow(18).mul(100);

      await weth.connect(whale).transfer(user1.address, amount);
      await weth.connect(user1).approve(vaultPeriphery.address, ethers.constants.MaxUint256);

      expect(vaultPeriphery.connect(user1).depositWeth(amount)).to.be.revertedWith('SlippageToleranceBreached()');
    });

    it('should go through on updating max tolerance', async () => {
      const [admin, user1] = await hre.ethers.getSigners();
      const { vaultPeriphery, weth, vault, wethOracle, lpOracle } = await vaultPeripheryFixture();
      await unlockWhales();

      const whale = await ethers.getSigner(addresses.WETH_WHALE);
      const amount = BigNumber.from(10).pow(18).mul(100);

      await weth.connect(whale).transfer(user1.address, amount);
      await weth.connect(user1).approve(vaultPeriphery.address, ethers.constants.MaxUint256);

      await vaultPeriphery.connect(admin).updateTolerance(100);

      await vaultPeriphery.connect(user1).depositWeth(amount);

      const wethValue = amount
        .mul((await wethOracle.latestRoundData()).answer)
        .mul(BigNumber.from(10).pow(18))
        .div(BigNumber.from(10).pow(8));
      const lpValue = await lpOracle.lp_price();

      const x = wethValue.div(lpValue);
      const min = x.mul(1000).sub(BigNumber.from(10).mul(x)).div(1000);

      expect(await vault.balanceOf(user1.address)).to.be.gt(min);
    });
  });
});
