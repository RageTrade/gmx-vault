// Integration Testing New
import { ClearingHouse, parseTokenAmount, priceToPriceX128, IUniswapV3Pool, priceX128ToPrice } from '@ragetrade/sdk';
import { BigNumber } from 'ethers';
import hre from 'hardhat';

import { eightyTwentyCurveStrategyFixture } from './fixtures/eighty-twenty-curve-strategy';
import {
  checkAccountNetProfit,
  checkLiquidityPosition,
  checkLiquidityPositionApproximate,
  checkLiquidityPositionNum,
  checkNetTokenPosition,
  checkNetTokenPositionApproximate,
  logRageParams,
  swapToken,
} from './utils/rage-helpers';
import {
  changeEthPriceInGLP,
  checkTotalAssets,
  checkTotalAssetsApproximate,
  checkTotalGLPApproximate,
  checkTotalSupply,
  checkTotalSupplyApproximate,
  checkVaultRangeParams,
  checkVaultRangeParamsApproximate,
  increaseBlockTimestamp,
  logVaultParams,
} from './utils/vault-helpers';

import { impersonateAccount } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { parseEther } from 'ethers/lib/utils';
import {
  ClearingHouseLens,
  ERC20,
  GMXYieldStrategy,
  UniswapV3Pool,
  VPoolWrapper,
  OracleMock,
  SwapSimulator,
} from '../typechain-types';
import { gmxYieldStrategyFixture } from './fixtures/eighty-twenty-gmx-strategy';
import { activateMainnetFork } from './utils/mainnet-fork';

describe('EightyTwentyGMXStrategy', () => {
  let gmxYieldStrategy: GMXYieldStrategy;
  let sGLP: ERC20;
  let fsGLP: ERC20;
  let whale: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let trader0: SignerWithAddress;
  let ethPool: {
    vToken: ERC20;
    vPool: UniswapV3Pool;
    vPoolWrapper: VPoolWrapper;
    oracle: OracleMock;
    SwapSimulator: SwapSimulator;
    clearingHouseLens: ClearingHouseLens;
  };
  let clearingHouse: ClearingHouse;
  let clearingHouseLens: ClearingHouseLens;
  let vaultAccountNo: BigNumber;
  let ethPoolId: string;
  let trader0AccountNo: BigNumber;

  before(async () => {
    await activateMainnetFork({ blockNumber: 18099162 });
    await gmxYieldStrategyFixture();
  });

  beforeEach(async () => {
    ({
      gmxYieldStrategy,
      sGLP,
      fsGLP,
      user1,
      user2,
      clearingHouseLens,
      vaultAccountNo,
      ethPoolId,
      clearingHouse,
      ethPool,
      trader0,
      trader0AccountNo,
    } = await gmxYieldStrategyFixture());

    whale = await hre.ethers.getSigner('0x087e9c8ef2d97740340a471ff8bb49f5490f6cf6');
    await impersonateAccount(whale.address);
  });

  describe('#Scenarios', () => {
    it('Rebalance', async () => {
      await sGLP.connect(whale).transfer(user1.address, parseEther('18139.0650524482'));
      await gmxYieldStrategy.connect(user1).deposit(parseEther('18139.0650524482'), user1.address);

      console.log('protocolInfo', await clearingHouseLens.getProtocolInfo());

      // console.log('vPool', await clearingHouseLens.getVPool(ethPoolId));
      // console.log('CH', await clearingHouseLens.clearingHouse(), clearingHouse.address, ethPool.vToken.address);
      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
      // await checkVaultRangeParams(gmxYieldStrategy, -197850, -188910, 131437400051827n);
      // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      // await checkTotalAssets(gmxYieldStrategy, parseEther('18139.0650524482'));
      // await checkTotalSupply(gmxYieldStrategy, parseEther('18139.0650524482'));
      await increaseBlockTimestamp(50000);

      await logVaultParams('Initial Deposit - user1', gmxYieldStrategy);
      await logRageParams(
        'Initial Deposit - user1',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      // console.log('before swap');
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 119065130813353000n, 0, false, false);

      //   const priceX128 = await priceToPriceX128(1665.658746887488043886, 6, 18);
      //   await gmxYieldStrategy.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(1_000_000);

      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -30163108n);
      await gmxYieldStrategy.rebalance();
      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -196670, -187730, 131437400051827n);
      // await checkVaultRangeParams(gmxYieldStrategy, -196670, -187730, 131437400051827n);
      // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -119065130813353002n);
      // await checkTotalSupply(gmxYieldStrategy, parseEther('18139.0650524482'));
      // await checkTotalGLPApproximate(gmxYieldStrategy, 18106300476737700000000n);

      await logVaultParams('Rebalance', gmxYieldStrategy);
      await logRageParams(
        'Rebalance',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );
    });

    it.skip('New Deposit', async () => {
      await sGLP.connect(whale).transfer(user1.address, parseEther('18139.0650524482'));
      await sGLP.connect(whale).transfer(user2.address, parseEther('18139.0650524482'));

      await gmxYieldStrategy.connect(user1).deposit(parseEther('18139.0650524482'), user1.address);

      await gmxYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
      // await checkVaultRangeParams(gmxYieldStrategy, -197850, -188910, 131437400051827n);
      // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      // await checkTotalAssets(gmxYieldStrategy, parseTokenAmount(10n, 18));
      // await checkTotalSupply(gmxYieldStrategy, parseTokenAmount(10n, 18));
      await increaseBlockTimestamp(50000);

      await logVaultParams('Initial Deposit - user1', gmxYieldStrategy);
      await logRageParams(
        'Initial Deposit - user1',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      // console.log('before swap');
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 119065130813353000n, 0, false, false);

      //   const priceX128 = await priceToPriceX128(1665.658746887488043886, 6, 18);
      //   await gmxYieldStrategy.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(1_000_000);

      // await changeEthPriceInGLP(1000) ===> TO CHANGE ETH PRICE IN GLP
      // console.log(await priceX128ToPrice(await gmxYieldStrategy.getPriceX128(), 6, 18)); ===> TO LOG GLP PRICE

      // await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      // await accrueFees(
      //   gmxYieldStrategy.address,
      //   gauge,
      //   crv,
      //   usdt,
      //   gmxYieldStrategy,
      //   triCrypto,
      //   uniswapQuoter,
      //   lpToken,
      // );
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -30163108n);

      await gmxYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      // await checkTotalAssetsApproximate(gmxYieldStrategy, 19989164205961000000n);
      // await checkTotalSupplyApproximate(gmxYieldStrategy, 20010847548218700000n);
      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPositionApproximate(
      //   clearingHouseLens,
      //   vaultAccountNo,
      //   ethPoolId,
      //   0,
      //   -197850,
      //   -188910,
      //   263017376982064n,
      // );
      // await checkVaultRangeParamsApproximate(gmxYieldStrategy, -197850, -188910, 263017376982064n);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -119065130813353001n);
      await logVaultParams('Deposit', gmxYieldStrategy);
      await logRageParams(
        'Deposit',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );
    });

    it.skip('Partial Withdraw', async () => {
      await sGLP.connect(whale).transfer(user1.address, parseEther('18139.0650524482'));
      await sGLP.connect(whale).transfer(user2.address, parseEther('18139.0650524482'));

      await gmxYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
      // await checkVaultRangeParams(gmxYieldStrategy, -197850, -188910, 131437400051827n);
      // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      // await checkTotalAssets(gmxYieldStrategy, parseTokenAmount(10n, 18));
      // await checkTotalSupply(gmxYieldStrategy, parseTokenAmount(10n, 18));
      await increaseBlockTimestamp(50000);

      await logVaultParams('Initial Deposit - user1', gmxYieldStrategy);
      await logRageParams(
        'Initial Deposit - user1',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      // console.log('before swap');
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 119065130813353000n, 0, false, false);

      //   const priceX128 = await priceToPriceX128(1665.658746887488043886, 6, 18);
      //   await gmxYieldStrategy.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(1_000_000);
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -30163108n);

      // await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      // await accrueFees(
      //   gmxYieldStrategy.address,
      //   gauge,
      //   crv,
      //   usdt,
      //   gmxYieldStrategy,
      //   triCrypto,
      //   uniswapQuoter,
      //   lpToken,
      // );

      await gmxYieldStrategy.connect(user1).withdraw(parseTokenAmount(5n, 18), user1.address, user1.address);
      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkTotalAssetsApproximate(gmxYieldStrategy, 4989164205961090000n);
      // await checkTotalSupplyApproximate(gmxYieldStrategy, 4994576225890620000n);
      // await checkLiquidityPositionApproximate(
      //   clearingHouseLens,
      //   vaultAccountNo,
      //   ethPoolId,
      //   0,
      //   -197850,
      //   -188910,
      //   65647411349174n,
      // );
      // await checkVaultRangeParamsApproximate(gmxYieldStrategy, -197850, -188910, 65647411349174n);
      // // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -59467986586889700n);
      await logVaultParams('Withdraw', gmxYieldStrategy);
      await logRageParams(
        'Withdraw',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );
    });

    it.skip('EndToEnd Scenario - Multiple Deposits & Withdrawals', async () => {
      await sGLP.connect(whale).transfer(user1.address, parseEther('18139.0650524482'));
      await sGLP.connect(whale).transfer(user2.address, parseEther('18139.0650524482'));

      // Initial Deposit - user1
      await gmxYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await logVaultParams('Initial Deposit - user1', gmxYieldStrategy);
      await logRageParams(
        'Initial Deposit - user1',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
      // await checkVaultRangeParams(gmxYieldStrategy, -197850, -188910, 131437400051827n);
      // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      // await checkTotalAssets(gmxYieldStrategy, parseTokenAmount(10n, 18));
      // await checkTotalSupply(gmxYieldStrategy, parseTokenAmount(10n, 18));

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 119065130813353000n, 0, false, false);
      // TODO: Fix the check - expected = -1811804020n
      // // await checkAccountNetProfit(clearingHouse,vaultAccountNo,-1811821349n);
      await increaseBlockTimestamp(20_000);
      // await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      // await accrueFees(
      //   gmxYieldStrategy.address,
      //   gauge,
      //   crv,
      //   usdt,
      //   gmxYieldStrategy,
      //   triCrypto,
      //   uniswapQuoter,
      //   lpToken,
      // );
      // let priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      // await gmxYieldStrategy.setYieldTokenPriceX128(priceX128);

      // Initial Deposit - user2
      // console.log('BLOCK before increase', (await hre.ethers.provider.getBlockNumber()))
      await increaseBlockTimestamp(10000);
      // console.log('BLOCK after increase', (await hre.ethers.provider.getBlockNumber()))
      // // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -30124931n);
      await gmxYieldStrategy.connect(user2).deposit(parseTokenAmount(10n, 18), user2.address);
      // console.log('BLOCK after deposit', (await hre.ethers.provider.getBlockNumber()))
      await logVaultParams('Initial Deposit - user2', gmxYieldStrategy);
      await logRageParams(
        'Initial Deposit - user2',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      // await checkTotalAssetsApproximate(gmxYieldStrategy, 19983017869055200000n);
      // await checkTotalSupplyApproximate(gmxYieldStrategy, 20017011019280500000n);
      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPositionApproximate(
      //   clearingHouseLens,
      //   vaultAccountNo,
      //   ethPoolId,
      //   0,
      //   -197850,
      //   -188910,
      //   263098388518300n,
      // );
      // await checkVaultRangeParamsApproximate(gmxYieldStrategy, -197850, -188910, 263098388518300n);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -119065130813353002n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4998.91817108492, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 200508852251313000n, 0, false, false);
      // priceX128 = await priceToPriceX128(1.1585067916761, 6, 18);
      // // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      // await gmxYieldStrategy.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(20_000);
      // await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      // await accrueFees(
      //   gmxYieldStrategy.address,
      //   gauge,
      //   crv,
      //   usdt,
      //   gmxYieldStrategy,
      //   triCrypto,
      //   uniswapQuoter,
      //   lpToken,
      // );

      // Partial Deposit - user1
      await increaseBlockTimestamp(10000);
      // // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -103336910n);
      await gmxYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await logVaultParams('Partial Deposit - user1', gmxYieldStrategy);
      await logRageParams(
        'Partial Deposit - user1',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      // await checkTotalAssetsApproximate(gmxYieldStrategy, 29915383101766919557n);
      // await checkTotalSupplyApproximate(gmxYieldStrategy, 30068004388932400000n);
      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPositionApproximate(
      //   clearingHouseLens,
      //   vaultAccountNo,
      //   ethPoolId,
      //   0,
      //   -197850,
      //   -188910,
      //   395206032162820n,
      // );
      // await checkVaultRangeParamsApproximate(gmxYieldStrategy, -197850, -188910, 395206032162820n);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -319573983064666000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(5498.17799411523, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 259790609567501000n, 0, false, false);
      // priceX128 = await priceToPriceX128(1.24985573493289, 6, 18);
      // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      // await gmxYieldStrategy.setYieldTokenPriceX128(priceX128);

      await increaseBlockTimestamp(20_000);
      // await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      // await accrueFees(
      //   gmxYieldStrategy.address,
      //   gauge,
      //   crv,
      //   usdt,
      //   gmxYieldStrategy,
      //   triCrypto,
      //   uniswapQuoter,
      //   lpToken,
      // );

      // 24hr Rebalance
      await increaseBlockTimestamp(36400);
      // // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -207756819n);
      await gmxYieldStrategy.rebalance();

      await logVaultParams('24hr Rebalance', gmxYieldStrategy);
      await logRageParams(
        '24hr Rebalance',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPositionApproximate(
      //   clearingHouseLens,
      //   vaultAccountNo,
      //   ethPoolId,
      //   0,
      //   -194670,
      //   -185730,
      //   395206032162820n,
      // );
      // await checkVaultRangeParamsApproximate(gmxYieldStrategy, -194670, -185730, 395206032162820n);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -579364592632167000n);
      // await checkTotalAssetsApproximate(gmxYieldStrategy, 29772973774275100000n);
      // await checkTotalSupplyApproximate(gmxYieldStrategy, 30068004388932400000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4998.91817108492, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -259790609567501000n, 0, false, false);

      await increaseBlockTimestamp(20_000);
      // await swapUsdt(25000n, trader0.address, usdt, triCrypto, lpOracle);
      // await accrueFees(
      //   gmxYieldStrategy.address,
      //   gauge,
      //   crv,
      //   usdt,
      //   gmxYieldStrategy,
      //   triCrypto,
      //   uniswapQuoter,
      //   lpToken,
      // );
      // priceX128 = await priceToPriceX128(1.1585067916761, 6, 18);
      // // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      // await gmxYieldStrategy.setYieldTokenPriceX128(priceX128);

      // Partial Withdraw - user1
      await increaseBlockTimestamp(10000);
      // // await checkAccountNetProfit(clearingHouse, vaultAccountNo, 190339458n);
      await gmxYieldStrategy.connect(user1).withdraw(parseTokenAmount(5n, 18), user1.address, user1.address);

      await logVaultParams('Partial Withdraw - user1', gmxYieldStrategy);
      await logRageParams(
        'Partial Withdraw - user1',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPositionApproximate(
      //   clearingHouseLens,
      //   vaultAccountNo,
      //   ethPoolId,
      //   0,
      //   -194670,
      //   -185730,
      //   329197171926419n,
      // );
      // await checkVaultRangeParamsApproximate(gmxYieldStrategy, -194670, -185730, 329197171926419n);
      // await checkTotalAssetsApproximate(gmxYieldStrategy, 24935832155520300000n);
      // await checkTotalSupplyApproximate(gmxYieldStrategy, 25045928464547600000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4979.95927467972, 6, 18));
      //Arb1 - trader0 : Arb to close user1 withdrawn position
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -53406247782040200n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -266167735282626000n);

      await increaseBlockTimestamp(20_000);
      // await swapUsdt(25000n, trader0.address, usdt, triCrypto, lpOracle);
      // await accrueFees(
      //   gmxYieldStrategy.address,
      //   gauge,
      //   crv,
      //   usdt,
      //   gmxYieldStrategy,
      //   triCrypto,
      //   uniswapQuoter,
      //   lpToken,
      // );

      // priceX128 = await priceToPriceX128(1.13085856364611, 6, 18);
      // // console.log('yield token price', priceX128.mul(10n**30n).div(1n<<128n));
      // await gmxYieldStrategy.setYieldTokenPriceX128(priceX128);

      // Partial Withdraw - user2
      await increaseBlockTimestamp(10000);
      // // await checkAccountNetProfit(clearingHouse, vaultAccountNo, 20498698n);
      await gmxYieldStrategy.connect(user2).withdraw(parseTokenAmount(5n, 18), user2.address, user2.address);

      await logVaultParams('Partial Withdraw - user2', gmxYieldStrategy);
      await logRageParams(
        'Partial Withdraw - user2',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPositionApproximate(
      //   clearingHouseLens,
      //   vaultAccountNo,
      //   ethPoolId,
      //   0,
      //   -194670,
      //   -185730,
      //   263203417213376n,
      // );
      // await checkVaultRangeParamsApproximate(gmxYieldStrategy, -194670, -185730, 263203417213376n);
      // await checkTotalAssetsApproximate(gmxYieldStrategy, 19941605019687500000n);
      // await checkTotalSupplyApproximate(gmxYieldStrategy, 20025014925748100000n);

      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4951.48786057211, 6, 18));
      //Arb2 - trader0 : Arb to close user2 withdrawn position
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -53377188544524200n, 0, false, false);

      await logVaultParams('Arb2', gmxYieldStrategy);
      await logRageParams(
        'Arb2',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -212790546738102000n);
    });

    // Reset Code
    // Reset Code
    it.skip('Reset', async () => {
      await sGLP.connect(whale).transfer(user1.address, parseEther('18139.0650524482'));
      await sGLP.connect(whale).transfer(user2.address, parseEther('18139.0650524482'));

      let priceX128;
      // Initial Deposit - user1
      await gmxYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);

      await logVaultParams('Initial Deposit - user1', gmxYieldStrategy);
      await logRageParams(
        'Initial Deposit - user1',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
      // await checkVaultRangeParams(gmxYieldStrategy, -197850, -188910, 131437400051827n);
      // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      // await checkTotalAssets(gmxYieldStrategy, parseTokenAmount(10n, 18));
      // await checkTotalSupply(gmxYieldStrategy, parseTokenAmount(10n, 18));

      //Swap1 - trader0
      await increaseBlockTimestamp(50000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(6197.90154302086, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 408732660730720000n, 0, false, false);

      await increaseBlockTimestamp(50_000);
      // await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      // await accrueFees(
      //   gmxYieldStrategy.address,
      //   gauge,
      //   crv,
      //   usdt,
      //   gmxYieldStrategy,
      //   triCrypto,
      //   uniswapQuoter,
      //   lpToken,
      // );
      // priceX128 = await priceToPriceX128(1.33512488303275, 6, 18);
      // await gmxYieldStrategy.setYieldTokenPriceX128(priceX128);

      await logVaultParams('Swap1 - trader0', gmxYieldStrategy);
      await logRageParams(
        'Swap1 - trader0',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      // Rebalance
      await increaseBlockTimestamp(86400);
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -496043715n);
      await gmxYieldStrategy.rebalance();
      await logVaultParams('Rebalance', gmxYieldStrategy);
      await logRageParams(
        'Rebalance',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -193470, -184530, 131437400051827n);
      // await checkVaultRangeParams(gmxYieldStrategy, -193470, -184530, 131437400051827n);
      // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -408732660730720003n);
      // await checkTotalSupply(gmxYieldStrategy, parseTokenAmount(10n, 18));
      // await checkTotalAssetsApproximate(gmxYieldStrategy, 9705559012921618351n);

      //Swap2 - trader0
      await increaseBlockTimestamp(10000);
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 300570636197446000n, 0, false, false);

      await increaseBlockTimestamp(50_000);
      // await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      // await accrueFees(
      //   gmxYieldStrategy.address,
      //   gauge,
      //   crv,
      //   usdt,
      //   gmxYieldStrategy,
      //   triCrypto,
      //   uniswapQuoter,
      //   lpToken,
      // );
      // priceX128 = await priceToPriceX128(1.6274509127026, 6, 18);
      // await gmxYieldStrategy.setYieldTokenPriceX128(priceX128);
      await logVaultParams('Swap2 - trader0', gmxYieldStrategy);
      await logRageParams(
        'Swap2 - trader0',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Reset
      await increaseBlockTimestamp(10000);
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -1827617093n);
      await gmxYieldStrategy.rebalance();
      await logVaultParams('Reset', gmxYieldStrategy);
      await logRageParams(
        'Reset',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPositionApproximate(
      //   clearingHouseLens,
      //   vaultAccountNo,
      //   ethPoolId,
      //   0,
      //   -189500,
      //   -180560,
      //   74299620029031n,
      // );
      // await checkVaultRangeParamsApproximate(gmxYieldStrategy, -189500, -180560, 74299622540873n);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -709303296928167000n);
      // await checkTotalSupply(gmxYieldStrategy, parseTokenAmount(10n, 18));
      // await checkTotalAssetsApproximate(gmxYieldStrategy, 8604947648817179279n);

      //Arb1 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));

      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      await logVaultParams('ClosePositon 1 Before', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 1 Before',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -671993974032319518n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 1 After', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 1 After',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb2 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -634679748203374520n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 2', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 2',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );
      //Arb3 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -597365522374429522n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 3', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 3',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );
      //Arb4 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -560051296545484524n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 4', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 4',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );
      //Arb5 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -522737070716539526n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 5', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 5',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );
      //Arb6 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -485422844887594528n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 6', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 6',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );
      //Arb7 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -448108619058649530n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 7', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 7',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb8 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -410794393229704532n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 8', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 8',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb9 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -373480167400759534n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 9', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 9',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb10 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -336165941571814536n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 10', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 10',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb11 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -298851715742869538n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 11', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 11',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb12 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -261537489913924540n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 12', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 12',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb13 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -224223264084979542n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 13', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 13',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb14 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -186909038256034544n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 14', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 14',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb15 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -149594812427089546n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 15', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 15',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb16 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -112280586598144548n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 16', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 16',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb17 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -74966360769199550n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 17', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 17',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb18 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -37652134940254552n);
      //ClosePositon
      await increaseBlockTimestamp(10000);
      await gmxYieldStrategy.closeTokenPosition();
      await logVaultParams('ClosePositon 18', gmxYieldStrategy);
      await logRageParams(
        'ClosePositon 18',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      //Arb19 - trader0
      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(9218.30264095973, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -37314225828945000n, 0, false, false);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -337909111309554n);
      //ClosePositon
      //   await increaseBlockTimestamp(10000);
      //   await gmxYieldStrategy.closeTokenPosition();
      //   await logVaultParams('ClosePositon 19', gmxYieldStrategy);
      //   await logRageParams('ClosePositon 19', clearingHouse, clearingHouseLens, ethPool.vPool as unknown as IUniswapV3Pool, vaultAccountNo, 0, 0);
    });
    it.skip('Slippage Threshold - Partial Withdraw', async () => {
      await sGLP.connect(whale).transfer(user1.address, parseEther('18139.0650524482'));
      await sGLP.connect(whale).transfer(user2.address, parseEther('18139.0650524482'));

      await gmxYieldStrategy.connect(user1).deposit(parseTokenAmount(10n, 18), user1.address);
      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkLiquidityPosition(clearingHouseLens, vaultAccountNo, ethPoolId, 0, -197850, -188910, 131437400051827n);
      // await checkVaultRangeParams(gmxYieldStrategy, -197850, -188910, 131437400051827n);
      // await checkNetTokenPosition(clearingHouse, vaultAccountNo, ethPoolId, -1n);
      // await checkTotalAssets(gmxYieldStrategy, parseTokenAmount(10n, 18));
      // await checkTotalSupply(gmxYieldStrategy, parseTokenAmount(10n, 18));

      await logVaultParams('Deposit - user2', gmxYieldStrategy);
      await logRageParams(
        'Deposit - user2',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      await increaseBlockTimestamp(10000);

      //Set real price to end price so that funding payment is 0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4500.67224272213, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, 119065130813353000n, 0, false, false);

      await increaseBlockTimestamp(1_000_000);
      // await checkAccountNetProfit(clearingHouse, vaultAccountNo, -30163108n);

      // await swapEth(10, trader0.address, weth, triCrypto, lpOracle);
      // await accrueFees(
      //   gmxYieldStrategy.address,
      //   gauge,
      //   crv,
      //   usdt,
      //   gmxYieldStrategy,
      //   triCrypto,
      //   uniswapQuoter,
      //   lpToken,
      // );

      // const priceX128 = await priceToPriceX128(1.08094471200314, 6, 18);
      // await gmxYieldStrategy.setYieldTokenPriceX128(priceX128);

      await logVaultParams('Swap1 - trader0', gmxYieldStrategy);
      await logRageParams(
        'Swap1 - trader0',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      await increaseBlockTimestamp(10000);

      await gmxYieldStrategy.connect(user1).withdraw(parseTokenAmount(8n, 18), user1.address, user1.address);
      // await checkLiquidityPositionNum(clearingHouseLens, vaultAccountNo, ethPoolId, 1);
      // await checkTotalAssetsApproximate(gmxYieldStrategy, 2167358348789560000n);
      // await checkTotalSupplyApproximate(gmxYieldStrategy, 2169709422412270000n);
      // await checkLiquidityPositionApproximate(
      //   clearingHouseLens,
      //   vaultAccountNo,
      //   ethPoolId,
      //   0,
      //   -197850,
      //   -188910,
      //   28518096536276n,
      // );
      // await checkVaultRangeParamsApproximate(gmxYieldStrategy, -197850, -188910, 28518096536276n);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -119065130813353000n);

      await logVaultParams('Withdraw - user2', gmxYieldStrategy);
      await logRageParams(
        'Withdraw - user2',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );

      await increaseBlockTimestamp(10000);

      //Arb1 - trader0
      await ethPool.oracle.setPriceX128(await priceToPriceX128(4961.56838901073, 6, 18));
      await swapToken(clearingHouse, trader0, trader0AccountNo, ethPoolId, -93262698100728065n, 0, false, false);
      await increaseBlockTimestamp(10000);
      // await checkNetTokenPositionApproximate(clearingHouse, vaultAccountNo, ethPoolId, -25802432712625000n);
      await logVaultParams('Arb1 - trader0', gmxYieldStrategy);
      await logRageParams(
        'Arb1 - trader0',
        clearingHouse,
        clearingHouseLens,
        ethPool.vPool as unknown as IUniswapV3Pool,
        vaultAccountNo,
        0,
        0,
      );
    });
  });
  describe.skip('Protocol Fee Withdrawal', () => {
    it('should deduct rage fee (10% which can be changed)', async () => {
      const [admin, user] = await hre.ethers.getSigners();
      const { crv, usdt, lpToken, curveYieldStrategyTest, triCrypto } = await eightyTwentyCurveStrategyFixture();
      const gmxYieldStrategy = curveYieldStrategyTest.connect(admin);

      await gmxYieldStrategy.withdrawFees();
    });
  });
});
