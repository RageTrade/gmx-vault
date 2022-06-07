import { deployments, ethers } from 'hardhat';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';
import {
  ICurveGauge,
  ICurveStableSwap,
  ILPPriceGetter,
  IQuoter,
  CurveYieldStrategy__factory,
} from '../../typechain-types';

import { parseTokenAmount, priceToPriceX128, truncate } from '@ragetrade/sdk';
import { AggregatorV3Interface } from '@ragetrade/sdk/dist/typechain/vaults';

import addresses from './addresses';
import { updateSettlementTokenMargin } from '../utils/rage-helpers';
import { stealFunds } from '../utils/steal-funds';
import { rageTradeFixture } from './ragetrade-core-integration';
import { unlockWhales } from '../utils/curve-helper';

export const eightyTwentyCurveStrategyFixture = deployments.createFixture(async hre => {
  const { clearingHouse, settlementToken, pool0 } = await rageTradeFixture();

  // set price in pool0 @leaddev - setting price here would not change the price in vpool so moving it back into ragetrade-core
  // const initialPriceX128 = await priceToPriceX128(4000, 6, 18);
  // await pool0.oracle.setPriceX128(initialPriceX128);
  await unlockWhales();
  const tokenFactory = await hre.ethers.getContractFactory('ERC20PresetMinterPauser');
  const collateralToken = await tokenFactory.deploy('Collateral Token', 'CT');

  const ethPoolId = truncate(pool0.vToken.address);

  const [admin, user1, user2, trader0] = await hre.ethers.getSigners();

  const closePositionSlippageSqrtToleranceBps = 500; //5%
  const resetPositionThresholdBps = 2000; //20%
  const minNotionalPositionToCloseThreshold = parseTokenAmount(10, 6);
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
  )) as unknown as AggregatorV3Interface;

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

  let curveYieldStrategyTestFactory = new CurveYieldStrategy__factory(
    {
      ['contracts/libraries/SwapManager.sol:SwapManager']: swapManager.address,
      ['contracts/libraries/Logic.sol:Logic']: logic.address,
    },
    admin,
  );

  const curveYieldStrategyTest = await curveYieldStrategyTestFactory.deploy();

  await collateralToken.grantRole(await collateralToken.MINTER_ROLE(), curveYieldStrategyTest.address);

  await collateralToken.approve(clearingHouse.address, parseTokenAmount(10n ** 10n, 18));

  await settlementToken.approve(clearingHouse.address, parseTokenAmount(10n ** 5n, 6));

  await curveYieldStrategyTest.initialize({
    eightyTwentyRangeStrategyVaultInitParams: {
      baseVaultInitParams: {
        rageErc4626InitParams: {
          asset: lpToken.address,
          name: 'TriCrypto Shares',
          symbol: 'TCS',
        },
        ethPoolId,
        rageClearingHouse: clearingHouse.address,
        swapSimulator: pool0.SwapSimulator.address,
        rageCollateralToken: collateralToken.address,
        rageSettlementToken: settlementToken.address,
        clearingHouseLens: pool0.clearingHouseLens.address,
      },
      closePositionSlippageSqrtToleranceBps: closePositionSlippageSqrtToleranceBps,
      resetPositionThresholdBps: resetPositionThresholdBps,
      minNotionalPositionToCloseThreshold: minNotionalPositionToCloseThreshold,
    },
    usdt: addresses.USDT,
    usdc: addresses.USDC,
    weth: addresses.WETH,
    crvToken: addresses.CRV,
    gauge: addresses.GAUGE,
    uniV3Router: addresses.ROUTER,
    lpPriceHolder: addresses.QUOTER,
    tricryptoPool: addresses.TRICRYPTO_POOL,
  });

  await curveYieldStrategyTest.updateBaseParams(ethers.constants.MaxUint256, admin.address, 0, 0);
  await collateralToken.grantRole(await collateralToken.MINTER_ROLE(), curveYieldStrategyTest.address);
  const vaultAccountNo = await curveYieldStrategyTest.rageAccountNo();

  const whale = await ethers.getSigner(addresses.LP_TOKEN_WHALE);
  await lpToken.connect(whale).transfer(user1.address, parseTokenAmount(25n, 18));
  await lpToken.connect(user1).approve(curveYieldStrategyTest.address, parseTokenAmount(50n, 18));

  await lpToken.connect(whale).transfer(user2.address, parseTokenAmount(25n, 18));
  await lpToken.connect(user2).approve(curveYieldStrategyTest.address, parseTokenAmount(50n, 18));

  await curveYieldStrategyTest.updateCurveParams(1_000, 1_000, 0, 3_000, addresses.CRV_ORACLE);

  await curveYieldStrategyTest.grantAllowances();

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
    uniswapQuoter,
    curveYieldStrategyTest,
    clearingHouse,
    collateralToken,
    collateralTokenOracle,
    settlementToken,
    vaultAccountNo,
    ethPoolId,
    ethPool: pool0,
    clearingHouseLens: pool0.clearingHouseLens,
    swapSimulator: pool0.SwapSimulator,
    user1,
    user2,
    trader0,
    trader0AccountNo,
    admin,
    adminAccountNo,
  };
});
