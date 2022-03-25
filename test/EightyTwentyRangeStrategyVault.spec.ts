import hre from 'hardhat';
import { parseTokenAmount } from '@ragetrade/core/test/utils/stealFunds';
import { EightyTwentyRangeStrategyVaultTest } from '../typechain-types';
import { eightyTwentyRangeStrategyFixture } from './fixtures/eighty-twenty-range-strategy-vault';

describe('EightyTwentyRangeStrategyVault', () => {
  before(async () => {
    // deploys contracts once
    await eightyTwentyRangeStrategyFixture();
  });

  describe('#Deposit', () => {
    it('should perform first deposit', async () => {
      const [, user0] = await hre.ethers.getSigners();
      const { eightyTwentyRangeStrategyVaultTest } = await eightyTwentyRangeStrategyFixture();

      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 3n, 18), user0.address);

      // console.log((await clearingHouse.getAccountInfo(vaultRageAccountNo)).tokenPositions[0].liquidityPositions[0]);
      // console.log(await test.baseLiquidity());
      // console.log(await test.baseTickLower());
      // console.log(await test.totalAssets());
      // console.log(await test.totalSupply());
      // test.getLiquidityChangeParamsOnRebalance();
    });
  });

  describe('#Withdraw', () => {
    before(async () => {
      const [, user0] = await hre.ethers.getSigners();
      const { eightyTwentyRangeStrategyVaultTest } = await eightyTwentyRangeStrategyFixture();

      await eightyTwentyRangeStrategyVaultTest.connect(user0).deposit(parseTokenAmount(10n ** 3n, 18), user0.address);
    });

    it.skip('should perform full withdraw with zero assets afterwards', async () => {
      const [, user0] = await hre.ethers.getSigners();
      const { eightyTwentyRangeStrategyVaultTest } = await eightyTwentyRangeStrategyFixture();
      // console.log(await clearingHouse.getAccountNetProfit(vaultRageAccountNo));
      // console.log((await clearingHouse.getAccountInfo(vaultRageAccountNo)).tokenPositions[0].liquidityPositions[0]);
      await eightyTwentyRangeStrategyVaultTest
        .connect(user0)
        .withdraw(parseTokenAmount(10n ** 2n, 18), user0.address, user0.address);
      // console.log((await clearingHouse.getAccountInfo(vaultRageAccountNo)).tokenPositions[0].liquidityPositions[0]);
      // console.log(await test.baseLiquidity());
      // console.log(await test.baseTickLower());
      // console.log(await test.totalAssets());
      // console.log(await test.totalSupply());
    });
  });
});
