import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import { GMXBatchingManager } from '../typechain-types';
import addresses from './fixtures/addresses';
import { gmxBatchingManagerFixture } from './fixtures/gmx-batcing-manager';
import { unlockWhales } from './utils/curve-helper';

describe('Vault Periphery', () => {
  let admin: SignerWithAddress;
  let vault: SignerWithAddress;
  let keeper: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let gmxBatchingManager: GMXBatchingManager;
  before(async () => {
    await gmxBatchingManagerFixture();
  });
  beforeEach(async () => {
    ({ admin, vault, user1, gmxBatchingManager } = await gmxBatchingManagerFixture());
  });
});
