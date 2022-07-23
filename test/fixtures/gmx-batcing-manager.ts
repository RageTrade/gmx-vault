import { GMX_ECOSYSTEM_ADDRESSES as addresses } from './addresses';
import { deployments } from 'hardhat';
import { curveYieldStrategyFixture } from './curve-yield-strategy';
import { GMXBatchingManager__factory } from '../../typechain-types';
import { ethers } from 'ethers';
import { unlockWhales } from '../utils/curve-helper';

export const gmxBatchingManagerFixture = deployments.createFixture(async hre => {
  const [admin, vault, keeper, user1, user2] = await hre.ethers.getSigners();
  await unlockWhales();

  const gmxBatchingManagerFactory = new GMXBatchingManager__factory();

  const gmxBatchingManager = await gmxBatchingManagerFactory.deploy();

  await gmxBatchingManager.initialize(addresses.StakedGlp, addresses.RewardRouter, vault.address, keeper.address);

  return {
    admin,
    vault,
    keeper,
    user1,
    user2,
    gmxBatchingManager,
  };
});
