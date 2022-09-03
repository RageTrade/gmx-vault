import { deployments } from 'hardhat';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';
import {
  AggregatorV3Interface,
  CurveYieldStrategyTest__factory,
  ICurveGauge,
  ICurveStableSwap,
  ILPPriceGetter,
  IQuoter,
} from '../../typechain-types';

import { parseTokenAmount } from '@ragetrade/sdk';

import addresses from './addresses';
import { eightyTwentyRangeStrategyFixture } from './eighty-twenty-range-strategy-vault';

export const curveYieldStrategyFixture = deployments.createFixture(async hre => {
  const {
    clearingHouse,
    collateralToken,
    settlementToken,
    settlementTokenTreasury,
    ethPoolId,
    swapSimulator,
    clearingHouseLens,
  } = await eightyTwentyRangeStrategyFixture();

  const [signer, user1, user2] = await hre.ethers.getSigners();

  const lpToken = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.TRICRYPTO_LP_TOKEN,
  )) as ERC20;

  const usdc = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.USDC,
  )) as ERC20;

  const usdt = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.USDT,
  )) as ERC20;

  const weth = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.WETH,
  )) as ERC20;

  const crv = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.CRV,
  )) as ERC20;

  const triCrypto = (await hre.ethers.getContractAt(
    'contracts/interfaces/curve/ICurveStableSwap.sol:ICurveStableSwap',
    addresses.TRICRYPTO_POOL,
  )) as ICurveStableSwap;

  const gauge = (await hre.ethers.getContractAt(
    'contracts/interfaces/curve/ICurveGauge.sol:ICurveGauge',
    addresses.NEW_GAUGE,
  )) as ICurveGauge;

  const crvOracle = (await hre.ethers.getContractAt(
    '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol:AggregatorV3Interface',
    addresses.CRV_ORACLE,
  )) as AggregatorV3Interface;

  const wethOracle = (await hre.ethers.getContractAt(
    '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol:AggregatorV3Interface',
    addresses.WETH_ORACLE,
  )) as AggregatorV3Interface;

  const lpOracle = (await hre.ethers.getContractAt(
    'contracts/interfaces/curve/ILPPriceGetter.sol:ILPPriceGetter',
    addresses.QUOTER,
  )) as ILPPriceGetter;

  const uniswapQuoter = (await hre.ethers.getContractAt(
    '@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol:IQuoter',
    '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
  )) as IQuoter;

  const swapManager = await (await hre.ethers.getContractFactory('SwapManager')).deploy();
  const logic = await (
    await hre.ethers.getContractFactory('Logic', {
      libraries: {
        ['contracts/libraries/SwapManager.sol:SwapManager']: swapManager.address,
      },
    })
  ).deploy();

  let curveYieldStrategyTestFactory = new CurveYieldStrategyTest__factory(
    {
      ['contracts/libraries/SwapManager.sol:SwapManager']: swapManager.address,
      ['contracts/libraries/Logic.sol:Logic']: logic.address,
    },
    signer,
  );

  let curveYieldStrategyTest = await curveYieldStrategyTestFactory.deploy({
    eightyTwentyRangeStrategyVaultInitParams: {
      baseVaultInitParams: {
        rageErc4626InitParams: {
          asset: lpToken.address,
          name: 'TriCrypto Shares',
          symbol: 'TCS',
        },
        ethPoolId,
        swapSimulator: swapSimulator.address,
        rageClearingHouse: clearingHouse.address,
        clearingHouseLens: clearingHouseLens.address,
        rageCollateralToken: collateralToken.address,
        rageSettlementToken: settlementToken.address,
      },
      closePositionSlippageSqrtToleranceBps: 0,
      resetPositionThresholdBps: 0,
      minNotionalPositionToCloseThreshold: 0,
    },
    usdt: addresses.USDT,
    usdc: addresses.USDC,
    weth: addresses.WETH,
    crvToken: addresses.CRV,
    gauge: addresses.NEW_GAUGE,
    uniV3Router: addresses.ROUTER,
    lpPriceHolder: addresses.QUOTER,
    tricryptoPool: addresses.TRICRYPTO_POOL,
  });

  await collateralToken.grantRole(await collateralToken.MINTER_ROLE(), curveYieldStrategyTest.address);

  await settlementToken
    .connect(settlementTokenTreasury)
    .approve(curveYieldStrategyTest.address, parseTokenAmount(10n ** 10n, 18));

  await collateralToken
    .connect(settlementTokenTreasury)
    .approve(clearingHouse.address, parseTokenAmount(10n ** 10n, 18));

  await collateralToken.approve(clearingHouse.address, parseTokenAmount(10n ** 10n, 18));

  await settlementToken.approve(clearingHouse.address, parseTokenAmount(10n ** 5n, 6));

  await curveYieldStrategyTest.updateCurveParams(1_000, 1_000, 0, 4_000, addresses.NEW_GAUGE, addresses.CRV_ORACLE);

  return {
    crv,
    usdt,
    usdc,
    weth,
    gauge,
    lpToken,
    lpOracle,
    wethOracle,
    triCrypto,
    crvOracle,
    uniswapQuoter,
    curveYieldStrategyTest,
  };
});
