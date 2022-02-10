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

import { smock } from '@defi-wonderland/smock';
import { ADDRESS_ZERO, priceToClosestTick } from '@uniswap/v3-sdk';
const whaleForBase = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
const whaleForWETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

config();
const { ALCHEMY_KEY } = process.env;
let UINT256_MAX = '115792089237316195423570985008687907853269984665640564039457584007913129639935'; //(2^256 - 1 )

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SUSHI_FACTORY_ADDRESS = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac';
const SUSHI_ROUTER_ADDRESS = '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F';

describe('Clearing House Scenario 1', () => {
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
  let baseVault: BaseVault;
  let collateralToken: CollateralToken;

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
    clearingHouse.addCollateralSupport(rBase.address, rBaseOracle.address, 300);

    const baseVaultFactory = await hre.ethers.getContractFactory('BaseSushiVault');
    baseVault = await baseVaultFactory.deploy(wethUsdcPairAddress, 'RageVault', 'RV', vTokenAddress);

    const collateralTokenFactory = await hre.ethers.getContractFactory('CollateralToken');
    collateralToken = await collateralTokenFactory.deploy();
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
    });
    it('Sushi Factory Check', async () => {
      const poolAddress = await sushiFactory.getPair(WETH_ADDRESS, USDC_ADDRESS);
      console.log(poolAddress);
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
      console.log(wethBalance.toBigInt());
      console.log(usdcBalanace.toBigInt());
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

      console.log(wethBalanceFinal.toBigInt());
      console.log(usdcBalanaceFinal.toBigInt());
      console.log(lpTokenBalanceFinal.toBigInt());
    });
  });

  describe('#Base Vault', () => {
    it('Approve', async () => {
      await wethUsdcSushiPair.connect(user0).approve(baseVault.address, UINT256_MAX);
    });
    it('Initialize', async () => {
      await baseVault.__BaseVault_init(admin.address, clearingHouse.address, collateralToken.address);
    });
    it('Deposit', async () => {
      const lpTokenBalanceFinal = await wethUsdcSushiPair.balanceOf(user0.address);
      await baseVault.connect(user0).deposit(lpTokenBalanceFinal, user0.address);

      const baseVaultBalance = await baseVault.balanceOf(user0.address);
      console.log(baseVaultBalance.toBigInt());
    });
  });
});
