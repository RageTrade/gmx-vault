import hre, { waffle } from 'hardhat';
import { truncate } from '@ragetrade/core/test/utils/vToken';
import { RageTradeSetup } from './setup/ragetrade';
import { EightyTwentyRangeStrategyVaultTest } from '../typechain-types';
import { activateMainnetFork, deactivateMainnetFork } from '@ragetrade/core/test/utils/mainnet-fork';

const { deployContract } = waffle;

describe('EightyTwentyRangeStrategyVault', () => {
  let snapshotId: string;
  let rageTrade = new RageTradeSetup();
  let test: EightyTwentyRangeStrategyVaultTest;

  before(async () => {
    await activateMainnetFork();
    // setup rage trade
    await rageTrade.setup();

    // deploy EightyTwentyRangeStrategyVault
    const {
      settlementToken,
      pools: [pool0],
    } = await rageTrade.getContracts();
    test = await (
      await hre.ethers.getContractFactory('EightyTwentyRangeStrategyVaultTest')
    ).deploy(settlementToken.address, 'Hello', 'Hello', truncate(pool0.vToken.address));

    // take snapshot
    snapshotId = await hre.ethers.provider.send('evm_snapshot', []);
  });
  afterEach(async () => {
    await hre.network.provider.send('evm_revert', [snapshotId]);
    snapshotId = await hre.ethers.provider.send('evm_snapshot', []);
  });
  after(deactivateMainnetFork);

  describe('#rebalance', () => {
    it('should not update ticks when price within thresholds', async () => {
      // test.getLiquidityChangeParamsOnRebalance();
    });
    it('should update ticks when price outside thresholds within range');
    it('should update ticks when price outside range');
  });

  describe('#deposit', () => {
    it('should work when no existing range and no vault liquidity');
    it('should work when existing range and vault liquidity');
  });
});
