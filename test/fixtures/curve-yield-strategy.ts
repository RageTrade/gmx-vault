import { deployments } from 'hardhat';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';
import { AggregatorV3Interface, ICurveGauge, ICurveStableSwap, ILPPriceGetter, IQuoterV2 } from '../../typechain-types';

import { parseTokenAmount } from '@ragetrade/sdk';

import addresses from './addresses';
import { eightyTwentyRangeStrategyFixture } from './eighty-twenty-range-strategy-vault';

export const curveYieldStrategyFixture = deployments.createFixture(async hre => {
  const { clearingHouse, collateralToken, settlementToken, settlementTokenTreasury } =
    await eightyTwentyRangeStrategyFixture();

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
    addresses.GAUGE,
  )) as ICurveGauge;

  const crvOracle = (await hre.ethers.getContractAt(
    '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol:AggregatorV3Interface',
    addresses.CRV_ORACLE,
  )) as AggregatorV3Interface;

  const lpOracle = (await hre.ethers.getContractAt(
    'contracts/interfaces/curve/ILPPriceGetter.sol:ILPPriceGetter',
    addresses.QUOTER,
  )) as ILPPriceGetter;

  // const crvWethPool = (await hre.ethers.getContractAt(
  //   '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol:IUniswapV3Pool',
  //   '0xa95b0f5a65a769d82ab4f3e82842e45b8bbaf101',
  // )) as UniswapV3Pool

  const uniswapQuoter = (await hre.ethers.getContractAt(
    '@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol:IQuoterV2',
    '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
  )) as IQuoterV2;

  const curveYieldStrategyTest = await (
    await hre.ethers.getContractFactory('CurveYieldStrategyTest')
  ).deploy(lpToken.address);

  await collateralToken.grantRole(await collateralToken.MINTER_ROLE(), curveYieldStrategyTest.address);

  await settlementToken
    .connect(settlementTokenTreasury)
    .approve(curveYieldStrategyTest.address, parseTokenAmount(10n ** 10n, 18));

  await collateralToken
    .connect(settlementTokenTreasury)
    .approve(clearingHouse.address, parseTokenAmount(10n ** 10n, 18));

  await collateralToken.approve(clearingHouse.address, parseTokenAmount(10n ** 10n, 18));

  await settlementToken.approve(clearingHouse.address, parseTokenAmount(10n ** 5n, 6));

  const [signer, user1, user2] = await hre.ethers.getSigners();

  await curveYieldStrategyTest.initialize(
    signer.address,
    clearingHouse.address,
    collateralToken.address,
    settlementToken.address,
    addresses.USDT,
    addresses.USDC,
    addresses.WETH,
    addresses.CRV,
    addresses.GAUGE,
    addresses.ROUTER,
    addresses.QUOTER,
    addresses.TRICRYPTO_POOL,
  );

  await curveYieldStrategyTest.setCrvOracle(addresses.CRV_ORACLE);

  return {
    crv,
    usdt,
    usdc,
    weth,
    gauge,
    lpToken,
    lpOracle,
    triCrypto,
    crvOracle,
    // crvWethPool,
    uniswapQuoter,
    curveYieldStrategyTest,
  };
});
