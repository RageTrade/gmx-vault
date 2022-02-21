import { expect } from 'chai';
import hre from 'hardhat';
import { network } from 'hardhat';
import { ContractReceipt, ContractTransaction, ethers, providers } from 'ethers';

import { BigNumber, BigNumberish } from '@ethersproject/bignumber';

import { activateMainnetFork, deactivateMainnetFork } from './utils/mainnet-fork';
import { getCreateAddressFor } from './utils/create-addresses';
import {
  RageTradeFactory,
  ClearingHouse,
  VPoolWrapper,
  ERC20,
  RealTokenMock,
  OracleMock,
  IERC20,
  IUniswapV3Pool,
  VToken,
  VBase,
  Account__factory,
  IWETH,
  IUniswapV2Factory,
  IMiniChefV2,
  IUniswapV2Router02,
  IUniswapV2Pair,
  BaseVault,
  CollateralToken,
  BaseSushiVault,
  IAggregatorV3Interface,
  VaultTest,
} from '../typechain-types';

// import { ConstantsStruct } from '../typechain-types/ClearingHouse';
import {
  UNISWAP_V3_FACTORY_ADDRESS,
  UNISWAP_V3_DEFAULT_FEE_TIER,
  UNISWAP_V3_POOL_BYTE_CODE_HASH,
  REAL_BASE,
} from './utils/realConstants';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { config } from 'dotenv';
import { stealFunds, tokenAmount } from './utils/stealFunds';
import {
  sqrtPriceX96ToTick,
  priceToSqrtPriceX96WithoutContract,
  priceToTick,
  tickToPrice,
  tickToSqrtPriceX96,
  sqrtPriceX96ToPrice,
  priceToSqrtPriceX96,
  sqrtPriceX96ToPriceX128,
  priceX128ToPrice,
} from './utils/price-tick';

import { FakeContract, smock, SmockContractBase } from '@defi-wonderland/smock';
import { ADDRESS_ZERO, priceToClosestTick } from '@uniswap/v3-sdk';
import {
  LiquidityChangeParamsStructOutput,
  LiquidityPositionViewStruct,
  VTokenPositionViewStruct,
} from '../typechain-types/IClearingHouse';
const whaleForBase = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
const whaleForWETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

config();
const { ALCHEMY_KEY } = process.env;
let UINT256_MAX = '115792089237316195423570985008687907853269984665640564039457584007913129639935'; //(2^256 - 1 )

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const SUSHI_ADDRESS = '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2';
const SUSHI_FACTORY_ADDRESS = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac';
const SUSHI_ROUTER_ADDRESS = '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F';

const SUSHI_CHEF_ADDRESS = '0xEF0881eC094552b2e128Cf945EF17a6752B4Ec5d';

describe('Vaults', () => {
  let vBaseAddress: string;
  let ownerAddress: string;
  let testContractAddress: string;
  let oracleAddress: string;
  // let constants: ConstantsStruct;
  let clearingHouse: ClearingHouse;
  let vPoolWrapper: VPoolWrapper;
  let sushiFactory: IUniswapV2Factory;
  let sushiRouter: IUniswapV2Router02;
  let wethUsdcSushiPair: IUniswapV2Pair;
  let vaultTest: VaultTest;
  let vaultAccountNo: BigNumber;
  let collateralToken: CollateralToken;
  let usdcOracle: FakeContract<IAggregatorV3Interface>;
  let wethOracle: FakeContract<IAggregatorV3Interface>;

  let miniChef: IMiniChefV2;
  let vPool: IUniswapV3Pool;
  let vToken: VToken;
  let vBase: VBase;

  let signers: SignerWithAddress[];
  let admin: SignerWithAddress;
  let user0: SignerWithAddress;
  let user1: SignerWithAddress;
  let user0AccountNo: BigNumberish;
  let user1AccountNo: BigNumberish;
  let user2: SignerWithAddress;
  let user2AccountNo: BigNumberish;

  let rBase: IERC20;
  let rBaseOracle: OracleMock;
  let collateralTokenOracle: OracleMock;

  let vTokenAddress: string;
  let vTokenAddress1: string;
  let dummyTokenAddress: string;

  let oracle: OracleMock;
  let oracle1: OracleMock;

  let realToken: IWETH;
  let realToken1: RealTokenMock;
  let initialBlockTimestamp: number;

  function X128ToDecimal(numX128: BigNumber, numDecimals: bigint) {
    return numX128.mul(10n ** numDecimals).div(1n << 128n);
  }

  function getNumChanges(
    liquidityChangeParamList: [
      LiquidityChangeParamsStructOutput,
      LiquidityChangeParamsStructOutput,
      LiquidityChangeParamsStructOutput,
      LiquidityChangeParamsStructOutput,
    ],
  ) {
    let num = 0;
    while (liquidityChangeParamList[num].liquidityDelta.gt(0n)) num++;

    return num;
  }

  async function initializePool(
    rageTradeFactory: RageTradeFactory,
    initialMarginRatio: BigNumberish,
    maintainanceMarginRatio: BigNumberish,
    twapDuration: BigNumberish,
    initialPrice: BigNumberish,
    lpFee: BigNumberish,
    protocolFee: BigNumberish,
    realTokenAddress: string,
  ) {
    const realToken = await hre.ethers.getContractAt('IWETH', realTokenAddress);

    const oracleFactory = await hre.ethers.getContractFactory('OracleMock');
    const oracle = await oracleFactory.deploy();
    await oracle.setSqrtPrice(initialPrice);

    await rageTradeFactory.initializePool({
      deployVTokenParams: {
        vTokenName: 'vWETH',
        vTokenSymbol: 'vWETH',
        rTokenDecimals: 18,
      },
      rageTradePoolInitialSettings: {
        initialMarginRatio,
        maintainanceMarginRatio,
        twapDuration,
        whitelisted: false,
        oracle: oracle.address,
      },
      liquidityFeePips: lpFee,
      protocolFeePips: protocolFee,
      slotsToInitialize: 100,
    });

    const eventFilter = rageTradeFactory.filters.PoolInitlized();
    const events = await rageTradeFactory.queryFilter(eventFilter, 'latest');
    const vPool = events[0].args[0];
    const vTokenAddress = events[0].args[1];
    const vPoolWrapper = events[0].args[2];

    return { vTokenAddress, realToken, oracle, vPool, vPoolWrapper };
  }

  async function setOracle(usdcPrice: BigNumberish, wethPrice: BigNumberish) {
    const block = await hre.ethers.provider.getBlock('latest');
    initialBlockTimestamp = block.timestamp;
    usdcOracle.latestRoundData.returns([0, usdcPrice, 0, block.timestamp, 0]);
    wethOracle.latestRoundData.returns([0, wethPrice, 0, block.timestamp, 0]);
  }

  before(async () => {
    await activateMainnetFork();

    rBase = await hre.ethers.getContractAt('IERC20', REAL_BASE);

    dummyTokenAddress = ethers.utils.hexZeroPad(BigNumber.from(148392483294).toHexString(), 20);

    const vBaseFactory = await hre.ethers.getContractFactory('VBase');
    // vBase = await vBaseFactory.deploy(REAL_BASE);
    // vBaseAddress = vBase.address;

    signers = await hre.ethers.getSigners();

    admin = signers[0];
    user0 = signers[1];
    user1 = signers[2];
    user2 = signers[3];

    const initialMargin = 20_000;
    const maintainanceMargin = 10_000;
    const timeHorizon = 300;
    const initialPrice = tickToSqrtPriceX96(-199590);
    const lpFee = 1000;
    const protocolFee = 500;

    const futureVPoolFactoryAddress = await getCreateAddressFor(admin, 3);
    const futureInsurnaceFundAddress = await getCreateAddressFor(admin, 4);

    // const VPoolWrapperDeployer = await (
    //   await hre.ethers.getContractFactory('VPoolWrapperDeployer')
    // ).deploy(futureVPoolFactoryAddress);

    const accountLib = await (await hre.ethers.getContractFactory('Account')).deploy();
    const clearingHouseLogic = await (
      await hre.ethers.getContractFactory('ClearingHouse', {
        libraries: {
          Account: accountLib.address,
        },
      })
    ).deploy();

    const vPoolWrapperLogic = await (await hre.ethers.getContractFactory('VPoolWrapper')).deploy();

    const insuranceFundLogic = await (await hre.ethers.getContractFactory('InsuranceFund')).deploy();

    const nativeOracle = await (await hre.ethers.getContractFactory('OracleMock')).deploy();

    const rageTradeFactory = await (
      await hre.ethers.getContractFactory('RageTradeFactory')
    ).deploy(
      clearingHouseLogic.address,
      vPoolWrapperLogic.address,
      insuranceFundLogic.address,
      rBase.address,
      nativeOracle.address,
    );

    vBase = await hre.ethers.getContractAt('VBase', await rageTradeFactory.vBase());
    vBaseAddress = vBase.address;

    clearingHouse = await hre.ethers.getContractAt('ClearingHouse', await rageTradeFactory.clearingHouse());

    const insuranceFund = await hre.ethers.getContractAt('InsuranceFund', await clearingHouse.insuranceFund());

    // await vBase.transferOwnership(VPoolFactory.address);
    // const realTokenFactory = await hre.ethers.getContractFactory('RealTokenMock');
    // realToken = await realTokenFactory.deploy();

    let out = await initializePool(
      rageTradeFactory,
      initialMargin,
      maintainanceMargin,
      timeHorizon,
      initialPrice,
      lpFee,
      protocolFee,
      WETH_ADDRESS,
    );

    vTokenAddress = out.vTokenAddress;
    oracle = out.oracle;
    realToken = out.realToken;
    vPool = (await hre.ethers.getContractAt(
      '@uniswap/v3-core-0.8-support/contracts/interfaces/IUniswapV3Pool.sol:IUniswapV3Pool',
      out.vPool,
    )) as IUniswapV3Pool;
    vToken = await hre.ethers.getContractAt('VToken', vTokenAddress);

    const vPoolWrapperAddress = out.vPoolWrapper;

    vPoolWrapper = await hre.ethers.getContractAt('VPoolWrapper', vPoolWrapperAddress);

    // increases cardinality for twap
    await vPool.increaseObservationCardinalityNext(100);

    const block = await hre.ethers.provider.getBlock('latest');
    initialBlockTimestamp = block.timestamp;
    rBaseOracle = await (await hre.ethers.getContractFactory('OracleMock')).deploy();
    sushiFactory = await hre.ethers.getContractAt('IUniswapV2Factory', SUSHI_FACTORY_ADDRESS);
    sushiRouter = (await hre.ethers.getContractAt('IUniswapV2Router02', SUSHI_ROUTER_ADDRESS)) as IUniswapV2Router02;
    const wethUsdcPairAddress = await sushiFactory.getPair(USDC_ADDRESS, WETH_ADDRESS);
    wethUsdcSushiPair = await hre.ethers.getContractAt('IUniswapV2Pair', wethUsdcPairAddress);

    const collateralTokenFactory = await hre.ethers.getContractFactory('CollateralToken');
    collateralToken = await collateralTokenFactory.deploy();
    await collateralToken.initialize('Vault Collateral', 'VC');
    collateralTokenOracle = await (await hre.ethers.getContractFactory('OracleMock')).deploy();
    clearingHouse.addCollateralSupport(rBase.address, rBaseOracle.address, 300);
    clearingHouse.addCollateralSupport(collateralToken.address, collateralTokenOracle.address, 300);

    const vaultTestFactory = await hre.ethers.getContractFactory('VaultTest');
    vaultTest = await vaultTestFactory.deploy(wethUsdcPairAddress, 'RageVault', 'RV', vTokenAddress);
    collateralToken.mint(vaultTest.address, tokenAmount(10n ** 6n, 18));

    usdcOracle = await smock.fake<IAggregatorV3Interface>('IAggregatorV3Interface');
    usdcOracle.decimals.returns(8);
    wethOracle = await smock.fake<IAggregatorV3Interface>('IAggregatorV3Interface');
    wethOracle.decimals.returns(8);
  });

  after(deactivateMainnetFork);

  describe('#Init Params', () => {
    it('Set Params', async () => {
      const liquidationParams = {
        liquidationFeeFraction: 1500,
        tokenLiquidationPriceDeltaBps: 3000,
        insuranceFundFeeShareBps: 5000,
      };
      const removeLimitOrderFee = tokenAmount(10, 6);
      const minimumOrderNotional = tokenAmount(1, 6).div(100);
      const minRequiredMargin = tokenAmount(20, 6);

      await clearingHouse.setPlatformParameters(
        liquidationParams,
        removeLimitOrderFee,
        minimumOrderNotional,
        minRequiredMargin,
      );
      const protocol = await clearingHouse.protocolInfo();
      const curPaused = await clearingHouse.paused();

      expect(protocol.minRequiredMargin).eq(minRequiredMargin);
      expect(protocol.liquidationParams.liquidationFeeFraction).eq(liquidationParams.liquidationFeeFraction);
      expect(protocol.liquidationParams.tokenLiquidationPriceDeltaBps).eq(
        liquidationParams.tokenLiquidationPriceDeltaBps,
      );
      expect(protocol.liquidationParams.insuranceFundFeeShareBps).eq(liquidationParams.insuranceFundFeeShareBps);

      expect(protocol.removeLimitOrderFee).eq(removeLimitOrderFee);
      expect(protocol.minimumOrderNotional).eq(minimumOrderNotional);
      expect(curPaused).to.be.false;
    });
  });

  describe('#Initialize', () => {
    it('Steal Funds', async () => {
      await stealFunds(REAL_BASE, 6, user0.address, '1000000', whaleForBase);
      await stealFunds(REAL_BASE, 6, user1.address, '1000000', whaleForBase);
      await stealFunds(REAL_BASE, 6, user2.address, '1000000', whaleForBase);

      expect(await rBase.balanceOf(user0.address)).to.eq(tokenAmount('1000000', 6));
      expect(await rBase.balanceOf(user1.address)).to.eq(tokenAmount('1000000', 6));
      expect(await rBase.balanceOf(user2.address)).to.eq(tokenAmount('1000000', 6));
    });
    it('Create Accounts', async () => {
      await clearingHouse.connect(user0).createAccount();
      user0AccountNo = 0;
      await clearingHouse.connect(user1).createAccount();
      user1AccountNo = 1;
      await clearingHouse.connect(user2).createAccount();
      user2AccountNo = 2;
    });

    it('Add Token Position Support - Pass', async () => {
      await clearingHouse.connect(admin).updateSupportedVTokens(vTokenAddress, true);
      expect(await clearingHouse.supportedVTokens(vTokenAddress)).to.be.true;
    });
    it('Add Base Deposit Support  - Pass', async () => {
      await clearingHouse.connect(admin).updateSupportedDeposits(rBase.address, true);
      expect(await clearingHouse.supportedDeposits(rBase.address)).to.be.true;
      await clearingHouse.connect(admin).updateSupportedDeposits(collateralToken.address, true);
      expect(await clearingHouse.supportedDeposits(collateralToken.address)).to.be.true;
    });
    it('Sushi Factory Check', async () => {
      const poolAddress = await sushiFactory.getPair(WETH_ADDRESS, USDC_ADDRESS);
    });
    it('Sushi Router Max Approval', async () => {
      rBase.connect(user0).approve(sushiRouter.address, UINT256_MAX);
      realToken.connect(user0).approve(sushiRouter.address, UINT256_MAX);
    });
  });
  describe('#Sushi Router', () => {
    it('Sushi Router Swap', async () => {
      const tokenAmountIn = tokenAmount('100000', 6);
      const tokenAmountOutMin = 0;
      const path = [USDC_ADDRESS, WETH_ADDRESS];
      const block = await hre.ethers.provider.getBlock('latest');
      const deadline = block.timestamp * 2;

      await sushiRouter
        .connect(user0)
        .swapExactTokensForTokens(tokenAmountIn, tokenAmountOutMin, path, user0.address, deadline);

      const wethBalance = await realToken.balanceOf(user0.address);
      const usdcBalanace = await rBase.balanceOf(user0.address);
    });
    it('Sushi Router Add Liquidity', async () => {
      const block = await hre.ethers.provider.getBlock('latest');
      const deadline = block.timestamp * 2;

      const wethBalance = await realToken.balanceOf(user0.address);
      const usdcBalanace = await rBase.balanceOf(user0.address);

      rBase.connect(user0).approve(sushiRouter.address, usdcBalanace);

      await sushiRouter
        .connect(user0)
        .addLiquidity(WETH_ADDRESS, USDC_ADDRESS, wethBalance, usdcBalanace, 0, 0, user0.address, deadline);

      const wethBalanceFinal = await realToken.balanceOf(user0.address);
      const usdcBalanaceFinal = await rBase.balanceOf(user0.address);
      const lpTokenBalanceFinal = await wethUsdcSushiPair.balanceOf(user0.address);
    });
  });

  describe('#Base Vault', () => {
    it('Approve', async () => {
      await wethUsdcSushiPair.connect(user0).approve(vaultTest.address, UINT256_MAX);
    });
    it('Initialize', async () => {
      const sushiParams = {
        sushiRouter: sushiRouter.address,
        sushiChef: SUSHI_CHEF_ADDRESS,
        token0: USDC_ADDRESS,
        token1: WETH_ADDRESS,
        rewardToken: SUSHI_ADDRESS,
        token0Oracle: usdcOracle.address,
        token1Oracle: wethOracle.address,
        maxOracleDelayTime: 10n ** 5n,
        sushiPair: wethUsdcSushiPair.address,
        baseToToken0Route: [],
        baseToToken1Route: [USDC_ADDRESS, WETH_ADDRESS],
        token0ToBaseRoute: [],
        token1ToBaseRoute: [WETH_ADDRESS, USDC_ADDRESS],
        rewardToToken0Route: [],
        rewardToToken1Route: [],
      };
      await vaultTest.initialize(
        admin.address,
        clearingHouse.address,
        collateralToken.address,
        USDC_ADDRESS,
        sushiParams,
      );
      vaultAccountNo = await vaultTest.rageAccountNo();
    });
    it('Allowance', async () => {
      await vaultTest.grantAllowances();
      expect(await collateralToken.allowance(vaultTest.address, clearingHouse.address)).to.eq((1n << 256n) - 1n);
      expect(await rBase.allowance(vaultTest.address, clearingHouse.address)).to.eq((1n << 256n) - 1n);
      expect(await rBase.allowance(vaultTest.address, sushiRouter.address)).to.eq((1n << 256n) - 1n);
    });
    it('Settle Collateral - Positive Diff', async () => {
      await vaultTest.testSettleCollateral(tokenAmount(50000n, 6));
      const accountView = await clearingHouse.getAccountView(vaultAccountNo);
      const depositView = accountView.tokenDeposits;
      expect(depositView[0].rTokenAddress).to.eq(collateralToken.address);
      expect(depositView[0].balance).to.eq(tokenAmount(50000n, 18));
    });

    it('Settle Collateral - Negative Diff', async () => {
      await vaultTest.testSettleCollateral(tokenAmount(-25000n, 6));
      const accountView = await clearingHouse.getAccountView(vaultAccountNo);
      const depositView = accountView.tokenDeposits;
      expect(depositView[0].rTokenAddress).to.eq(collateralToken.address);
      expect(depositView[0].balance).to.eq(tokenAmount(25000n, 18));
    });

    it('Settle Collateral - No Balance', async () => {
      await vaultTest.testSettleCollateral(tokenAmount(-25000n, 6));
      const accountView = await clearingHouse.getAccountView(vaultAccountNo);
      const depositView = accountView.tokenDeposits;
      expect(depositView.length).to.eq(0);
    });

    it('Deposit', async () => {
      await setOracle(10n ** 8n, 3000n * 10n ** 8n);
      const lpTokenBalanceFinal = await wethUsdcSushiPair.balanceOf(user0.address);
      await vaultTest.connect(user0).deposit(lpTokenBalanceFinal, user0.address);

      expect(await wethUsdcSushiPair.balanceOf(vaultTest.address)).to.eq(lpTokenBalanceFinal);
      expect(await wethUsdcSushiPair.balanceOf(user0.address)).to.eq(0);
      expect(await vaultTest.balanceOf(user0.address)).to.eq(lpTokenBalanceFinal);

      const accountView = await clearingHouse.getAccountView(vaultAccountNo);
      const depositView = accountView.tokenDeposits;
      const depositValue = await vaultTest.getMarketValue(lpTokenBalanceFinal);
      expect(depositView[0].balance).to.eq(tokenAmount(depositValue, 12));
    });
    it('Withdraw', async () => {
      await setOracle(10n ** 8n, 3000n * 10n ** 8n);
      const vaultBalance = await wethUsdcSushiPair.balanceOf(vaultTest.address);
      await vaultTest.connect(user0).withdraw(100n, user0.address, user0.address);

      expect(await wethUsdcSushiPair.balanceOf(vaultTest.address)).to.eq(vaultBalance.sub(100n));
      expect(await wethUsdcSushiPair.balanceOf(user0.address)).to.eq(100n);
      expect(await vaultTest.balanceOf(user0.address)).to.eq(vaultBalance.sub(100n));

      const accountView = await clearingHouse.getAccountView(vaultAccountNo);
      const depositView = accountView.tokenDeposits;
      const depositValue = await vaultTest.getMarketValue(vaultBalance.sub(100n));
      expect(depositView[0].balance).to.eq(tokenAmount(depositValue, 12));
    });

    it('Vault Market Value');

    it('Unrealized Balance');

    it('Total Assets');

    it('Rebalance Ranges');

    it('Rebalance Profit and Collateral');
  });

  describe('#Range Strategy', () => {
    describe('Liquidity Change Params', () => {
      it('No previous range', async () => {
        const vTokenPosition: VTokenPositionViewStruct = {
          vTokenAddress: vTokenAddress,
          balance: 0,
          netTraderPosition: 0,
          sumAX128Ckpt: 0,
          liquidityPositions: [],
        };
        const accountMarketValue = tokenAmount(50000n, 6);
        const liquidityChangeParams = await vaultTest.getLiquidityChangeParams(vTokenPosition, accountMarketValue);

        expect(getNumChanges(liquidityChangeParams)).to.eq(1);
        // expect(liquidityChangeParams[0].liquidityDelta).to.eq(0);

        const { sqrtPriceX96 } = await vPool.slot0();
        const price = await sqrtPriceX96ToPrice(sqrtPriceX96, vBase, vToken);
        const priceLower = price * 0.6;
        const priceUpper = price * 1.4;
        let tickLower = await priceToTick(priceLower, vBase, vToken);
        let tickUpper = await priceToTick(priceUpper, vBase, vToken);

        tickLower += 10 - (tickLower % 10);
        tickUpper -= tickUpper % 10;

        expect(liquidityChangeParams[0].tickLower).to.eq(tickLower);
        expect(liquidityChangeParams[0].tickUpper).to.eq(tickUpper);
      });

      // it('Previous Ranges Present', async () => {
      //   const liquidityPositions = [];
      //   const liquidityPosition: LiquidityPositionViewStruct = {
      //     limitOrderType: 0,
      //     tickLower: 19000,
      //     tickUpper: 21000,
      //     liquidity: 100_000n,
      //     vTokenAmountIn: 100n,
      //     sumALastX128: 0n,
      //     sumBInsideLastX128: 0n,
      //     sumFpInsideLastX128: 0n,
      //     sumFeeInsideLastX128: 0n
      //   }

      //   liquidityPositions.push(liquidityPosition)

      //   const vTokenPosition: VTokenPositionViewStruct = {
      //     vTokenAddress: vTokenAddress,
      //     balance: 0,
      //     netTraderPosition: 0,
      //     sumAX128Ckpt: 0,
      //     liquidityPositions: liquidityPositions,
      //   };

      //   const accountMarketValue = tokenAmount(50000n, 6);
      //   const liquidityChangeParams = await vaultTest.getLiquidityChangeParams(vTokenPosition, accountMarketValue);

      //   expect(getNumChanges(liquidityChangeParams)).to.eq(2);
      //   // expect(liquidityChangeParams[0].liquidityDelta).to.eq(0);

      //   const { sqrtPriceX96 } = await vPool.slot0();
      //   const price = await sqrtPriceX96ToPrice(sqrtPriceX96, vBase, vToken);
      //   const priceLower = price * 0.6;
      //   const priceUpper = price * 1.4;
      //   let tickLower = await priceToTick(priceLower, vBase, vToken);
      //   let tickUpper = await priceToTick(priceUpper, vBase, vToken);

      //   tickLower += 10 - (tickLower % 10);
      //   tickUpper -= tickUpper % 10;

      //   expect(liquidityChangeParams[0].tickLower).to.eq(tickLower);
      //   expect(liquidityChangeParams[0].tickUpper).to.eq(tickUpper);

      //   expect(liquidityChangeParams[1].tickLower).to.eq(liquidityPosition.tickLower);
      //   expect(liquidityChangeParams[1].tickUpper).to.eq(liquidityPosition.tickUpper);
      //   expect(liquidityChangeParams[1].liquidityDelta.mul(-1)).to.eq(liquidityPosition.liquidity);

      // });
    });
  });

  describe('#Sushi Strategy', () => {
    it('Market Value', async () => {
      const { reserve0, reserve1 } = await wethUsdcSushiPair.getReserves();

      const price = reserve1.div(reserve0);
      await setOracle(10n ** 8n, price.mul(10n ** 3n));

      const totalSupply = await wethUsdcSushiPair.totalSupply();

      const value = await vaultTest.getMarketValue(totalSupply);

      const { answer: price0 } = await usdcOracle.latestRoundData();
      const { answer: price1 } = await wethOracle.latestRoundData();

      console.log(value.toBigInt());
      console.log(
        reserve0
          .mul(price0)
          .add(reserve1.mul(price1).div(10n ** 12n))
          .div(10n ** 8n)
          .toBigInt(),
      );
    });
    it('DepositBase');
    // , async () => {
    //   await vaultTest.testDepositBase(tokenAmount(5000n, 6));
    // });
    it('WithdrawBase');
    // , async () => {
    //   await vaultTest.testWithdrawBase(tokenAmount(5000n, 6));
    // });
    it('Stake');
    it('Harvest');
  });
});
