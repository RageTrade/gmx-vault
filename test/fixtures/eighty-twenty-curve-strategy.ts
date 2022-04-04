import { deployments, ethers } from 'hardhat';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';
import { ICurveGauge, ICurveStableSwap, ILPPriceGetter, IQuoterV2 } from '../../typechain-types';

import { AggregatorV3Interface, parseTokenAmount, priceToPriceX128, truncate } from '@ragetrade/sdk';

import addresses from './addresses';
import { updateSettlementTokenMargin } from '../utils/rage-helpers';
import { stealFunds } from '../utils/steal-funds';
import { rageTradeFixture } from './ragetrade-core-integration';

export const eightyTwentyCurveStrategyFixture = deployments.createFixture(async hre => {
  const { clearingHouse, settlementToken, pool0 } = await rageTradeFixture();

  // set price in pool0 @leaddev - setting price here would not change the price in vpool so moving it back into ragetrade-core
  // const initialPriceX128 = await priceToPriceX128(4000, 6, 18);
  // await pool0.oracle.setPriceX128(initialPriceX128);

  const tokenFactory = await hre.ethers.getContractFactory('ERC20PresetMinterPauserUpgradeable');
  const collateralToken = await tokenFactory.deploy();
  await collateralToken.initialize('Collateral Token', 'CT');
  const yieldToken = await tokenFactory.deploy();
  await yieldToken.initialize('Yield Token', 'YT');

  const ethPoolId = truncate(pool0.vToken.address);
  const pool = await clearingHouse.getPoolInfo(truncate(pool0.vToken.address));

  const [admin, user1, user2, trader0, settlementTokenTreasury] = await hre.ethers.getSigners();

  const closePositionToleranceBps = 500; //5%
  const resetPositionThresholdBps = 2000; //20%
  const minNotionalPositionToCloseThreshold = parseTokenAmount(100, 6);
  const collateralTokenPriceX128 = await priceToPriceX128(1, 6, 18);

  const collateralTokenOracle = await (await hre.ethers.getContractFactory('OracleMock')).deploy();

  await clearingHouse.updateCollateralSettings(collateralToken.address, {
    oracle: collateralTokenOracle.address,
    twapDuration: 300,
    isAllowedForDeposit: true,
  });

  await stealFunds(
    settlementToken.address,
    await settlementToken.decimals(),
    settlementTokenTreasury.address,
    10n ** 7n,
    addresses.USDC_WHALE,
  );
  await yieldToken.mint(settlementTokenTreasury.address, parseTokenAmount(10n ** 20n, 18));

  await stealFunds(
    settlementToken.address,
    await settlementToken.decimals(),
    admin.address,
    10n ** 7n,
    addresses.USDC_WHALE,
  );

  await clearingHouse.createAccount();
  const adminAccountNo = (await clearingHouse.numAccounts()).sub(1);

  await clearingHouse.connect(trader0).createAccount();
  const trader0AccountNo = (await clearingHouse.numAccounts()).sub(1);

  await stealFunds(
    settlementToken.address,
    await settlementToken.decimals(),
    trader0.address,
    10n ** 7n,
    addresses.USDC_WHALE,
  );

  await updateSettlementTokenMargin(
    clearingHouse,
    settlementToken,
    trader0,
    trader0AccountNo,
    parseTokenAmount(10n ** 7n, 6),
  );

  await settlementToken.approve(clearingHouse.address, parseTokenAmount(10n ** 5n, 6));
  await clearingHouse.updateMargin(adminAccountNo, truncate(settlementToken.address), parseTokenAmount(10n ** 5n, 6));

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

  const uniswapQuoter = (await hre.ethers.getContractAt(
    '@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol:IQuoterV2',
    '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
  )) as IQuoterV2;

  const curveYieldStrategyTest = await (
    await hre.ethers.getContractFactory('CurveYieldStrategy')
  ).deploy(lpToken.address, 'TriCrypto Shares', 'TCS', ethPoolId);

  await collateralToken.grantRole(await collateralToken.MINTER_ROLE(), curveYieldStrategyTest.address);

  await settlementToken
    .connect(settlementTokenTreasury)
    .approve(curveYieldStrategyTest.address, parseTokenAmount(10n ** 10n, 18));

  await collateralToken
    .connect(settlementTokenTreasury)
    .approve(clearingHouse.address, parseTokenAmount(10n ** 10n, 18));

  await collateralToken.approve(clearingHouse.address, parseTokenAmount(10n ** 10n, 18));

  await settlementToken.approve(clearingHouse.address, parseTokenAmount(10n ** 5n, 6));

  await curveYieldStrategyTest.initialize(
    admin.address,
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

  await curveYieldStrategyTest.grantAllowances();
  await curveYieldStrategyTest.setCrvOracle(addresses.CRV_ORACLE);

  // curveYieldStrategyTest.setKeeper(admin.address);
  collateralToken.grantRole(await collateralToken.MINTER_ROLE(), curveYieldStrategyTest.address);
  const vaultAccountNo = await curveYieldStrategyTest.rageAccountNo();
  await yieldToken.mint(user1.address, parseTokenAmount(10n ** 10n, 18));
  await yieldToken.connect(user1).approve(curveYieldStrategyTest.address, parseTokenAmount(10n ** 10n, 18));

  await yieldToken.mint(user2.address, parseTokenAmount(10n ** 10n, 18));
  await yieldToken.connect(user2).approve(curveYieldStrategyTest.address, parseTokenAmount(10n ** 10n, 18));
  await settlementToken
    .connect(settlementTokenTreasury)
    .approve(curveYieldStrategyTest.address, parseTokenAmount(10n ** 20n, 18));

  await yieldToken
    .connect(settlementTokenTreasury)
    .approve(curveYieldStrategyTest.address, parseTokenAmount(10n ** 20n, 18));

  await curveYieldStrategyTest.updateDepositCap(parseTokenAmount(10n ** 10n, 18));

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
    clearingHouse,
    collateralToken,
    collateralTokenOracle,
    yieldToken,
    settlementToken,
    vaultAccountNo,
    settlementTokenTreasury,
    ethPoolId,
    ethPool: pool0,
    user1,
    user2,
    trader0,
    trader0AccountNo,
    admin,
    adminAccountNo,
  };
});
