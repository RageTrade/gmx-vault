import { impersonateAccount } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { priceX128ToPrice, randomAddress } from '@ragetrade/sdk';
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

  describe('#update params', () => {
    it('fails - fee incorrect', async () => {
      await expect(glpStakingManager.updateGMXParams(100000, 0, 0, randomAddress())).to.be.revertedWith(
        'GSM_INVALID_SETTER_VALUES()',
      );
    });
    it('fails - slippage threshold', async () => {
      await expect(glpStakingManager.updateGMXParams(0, 0, 100000, randomAddress())).to.be.revertedWith(
        'GSM_INVALID_SETTER_VALUES()',
      );
    });

    it('fails - batching manager address', async () => {
      await expect(glpStakingManager.updateGMXParams(0, 0, 0, ethers.constants.AddressZero)).to.be.revertedWith(
        'GSM_INVALID_SETTER_VALUES()',
      );
    });
  });

  describe('#set vault', () => {
    it('fails - already set', async () => {
      await expect(glpStakingManager.setVault(gmxYieldStrategy.address, true)).to.be.revertedWith(
        'GSM_INVALID_SET_VAULT()',
      );
    });
    it('fails - already unset', async () => {
      await expect(glpStakingManager.setVault(ethers.constants.AddressZero, false)).to.be.revertedWith(
        'GSM_INVALID_SET_VAULT()',
      );
    });

    it('passes - sets vault', async () => {
      const newVaultAddress = randomAddress();
      await glpStakingManager.setVault(newVaultAddress, true);
      expect(await glpStakingManager.isVault(newVaultAddress)).to.be.true;
    });

    it('passes - sets vault', async () => {
      const newVaultAddress = randomAddress();
      await glpStakingManager.setVault(newVaultAddress, true);
      await glpStakingManager.setVault(newVaultAddress, false);
      expect(await glpStakingManager.isVault(newVaultAddress)).to.be.false;
    });
  });

  describe('#withdraw fees', () => {
    it('fails not owner', async () => {
      await expect(glpStakingManager.connect(signers[1]).withdrawFees()).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it.skip('fails zero protocol fees', async () => {
      await expect(glpStakingManager.withdrawFees()).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#called not vault ', () => {
    it('deposit', async () => {
      await expect(glpStakingManager.connect(signers[1]).deposit(10, signers[1].address)).to.be.revertedWith(
        'GSM_CALLER_NOT_VAULT()',
      );
    });
    it('withdraw', async () => {
      await expect(
        glpStakingManager.connect(signers[1]).withdraw(10, signers[1].address, signers[1].address),
      ).to.be.revertedWith('GSM_CALLER_NOT_VAULT()');
    });

    it('mint', async () => {
      await expect(glpStakingManager.connect(signers[1]).mint(10, signers[1].address)).to.be.revertedWith(
        'GSM_CALLER_NOT_VAULT()',
      );
    });
    it('redeem', async () => {
      await expect(
        glpStakingManager.connect(signers[1]).redeem(10, signers[1].address, signers[1].address),
      ).to.be.revertedWith('GSM_CALLER_NOT_VAULT()');
    });
    it('depositToken', async () => {
      await expect(glpStakingManager.connect(signers[1]).depositToken(addresses.WETH, 10)).to.be.revertedWith(
        'GSM_CALLER_NOT_VAULT()',
      );
    });
  });
});
