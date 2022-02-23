import { assert, expect } from 'chai';
import hre, { network } from 'hardhat';

import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import arbConstants from './utils/arb-constants';

import { activateMainnetFork, deactivateMainnetFork } from './utils/mainnet-fork';

import { smock, FakeContract } from '@defi-wonderland/smock';

import {
  IWETH,
  IERC20,
  IVBase,
  IVToken,

  IMiniChefV2,
  IUniswapV2Factory,
  IUniswapV2Pair,
  IUniswapV2Router02,
  IUniswapV3Pool,

  IAggregatorV3Interface,

  IOracle,
  IVPoolWrapper,
  ClearingHouse,

  BaseSushiVault,
  VaultTest
} from '../typechain-types';

import { SushiParamsStruct } from '../typechain-types/VaultTest';

import {
  tickToSqrtPriceX96,
} from './utils/price-tick';

import { stealFunds, tokenAmount } from './utils/stealFunds';

const createUsers = async () => {
  let signers = await hre.ethers.getSigners();

  let admin = signers[0];
  let alice = signers[1];
  let bob = signers[2];
  let carol = signers[3];

  return { admin, alice, bob, carol }
}

const deployAndSetupCore = async () => {

  const realToken = await hre.ethers.getContractAt('IWETH', arbConstants.WETH_ADDRESS);
  const realBase = await hre.ethers.getContractAt('IERC20', arbConstants.USDC_ADDRESS);

  const oracleFactory = await hre.ethers.getContractFactory('OracleMock');
  const oracle = await (await oracleFactory.deploy()).deployed();
  await (await oracle.setSqrtPrice(tickToSqrtPriceX96(-199590))).wait();

  const accountLib = await (await hre.ethers.getContractFactory('Account')).deploy();
  await accountLib.deployed();

  const clearingHouseLogic = await (
    await hre.ethers.getContractFactory('ClearingHouse', {
      libraries: {
        Account: accountLib.address,
      },
    })
  ).deploy();
  await clearingHouseLogic.deployed();

  const vPoolWrapperLogic = await (await hre.ethers.getContractFactory('VPoolWrapper')).deploy();
  await vPoolWrapperLogic.deployed();

  const insuranceFundLogic = await (await hre.ethers.getContractFactory('InsuranceFund')).deploy();
  await insuranceFundLogic.deployed();

  const nativeOracle = await (await hre.ethers.getContractFactory('OracleMock')).deploy();
  await nativeOracle.deployed();

  const rageTradeFactory = await (
    await hre.ethers.getContractFactory('RageTradeFactory')
  ).deploy(
    clearingHouseLogic.address,
    vPoolWrapperLogic.address,
    insuranceFundLogic.address,
    realBase.address,
    nativeOracle.address,
  );
  await rageTradeFactory.deployed();

  const vBase: IVBase = await hre.ethers.getContractAt('IVBase', await rageTradeFactory.vBase());

  const clearingHouse: ClearingHouse = await hre.ethers.getContractAt('ClearingHouse', await rageTradeFactory.clearingHouse());

  await (await rageTradeFactory.initializePool({
    deployVTokenParams: {
      vTokenName: 'vWETH',
      vTokenSymbol: 'vWETH',
      rTokenDecimals: 18,
    },
    rageTradePoolInitialSettings: {
      initialMarginRatio: 20_000,
      maintainanceMarginRatio: 10_000,
      twapDuration: 300,
      whitelisted: false,
      oracle: oracle.address,
    },
    liquidityFeePips: 1000,
    protocolFeePips: 500,
    slotsToInitialize: 100,
  })).wait();

  const eventFilter = rageTradeFactory.filters.PoolInitlized();
  const events = await rageTradeFactory.queryFilter(eventFilter, 'latest');

  const vPool: IUniswapV3Pool = await hre.ethers.getContractAt('IUniswapV3Pool', events[0].args[0]);
  const vToken: IVToken = await hre.ethers.getContractAt('IVToken', events[0].args[1]);
  const vPoolWrapper: IVPoolWrapper = await hre.ethers.getContractAt('IVPoolWrapper', events[0].args[2]);

  return { vBase, vToken, realBase, realToken, clearingHouse, oracle, vPool, vPoolWrapper };
}

const deployAndSetupHelpers = async () => {
  const uniV2Factory: IUniswapV2Factory = await hre.ethers.getContractAt('IUniswapV2Factory', arbConstants.SUSHI_FACTORY_ADDRESS);
  const uniV2Router: IUniswapV2Router02 = await hre.ethers.getContractAt('IUniswapV2Router02', arbConstants.SUSHI_ROUTER_ADDRESS);
  const sushiChef: IMiniChefV2 = await hre.ethers.getContractAt('IMiniChefV2', arbConstants.SUSHI_CHEF_ADDRESS);

  const weth: IWETH = await hre.ethers.getContractAt('IWETH', arbConstants.WETH_ADDRESS);
  const usdc: IERC20 = await hre.ethers.getContractAt('IERC20', arbConstants.USDC_ADDRESS);
  const wethUsdc: IUniswapV2Pair = await hre.ethers.getContractAt('IUniswapV2Pair', arbConstants.WETH_USDC_PAIR);
  const sushiToken: IERC20 = await hre.ethers.getContractAt('IERC20', arbConstants.SUSHI_ADDRESS);

  return { uniV2Factory, uniV2Router, sushiChef, weth, usdc, wethUsdc, sushiToken }
}

const deployAndSetupVault = async (vWETH: string) => {
  const baseSushiVaultFactory = await hre.ethers.getContractFactory('BaseSushiVault');
  const baseSushiVault: BaseSushiVault = await baseSushiVaultFactory.deploy(
    arbConstants.WETH_USDC_PAIR, // _asset
    arbConstants.VAULT_NAME,     // _name
    arbConstants.VAULT_SYMBOL,   // _symbol
    vWETH                        // _vWethAddress
  )
  await baseSushiVault.deployed();

  const vaultTestFactory = await hre.ethers.getContractFactory('VaultTest');
  const vaultTest = await vaultTestFactory.deploy(
    arbConstants.WETH_USDC_PAIR, // _asset
    arbConstants.VAULT_NAME,     // _name
    arbConstants.VAULT_SYMBOL,   // _symbol
    vWETH                        // _vWethAddress
  )

  return { baseSushiVault, vaultTest };
}

const deployAndSetupChainlinkOralces = async () => {

  let usdcOracle = await smock.fake<IAggregatorV3Interface>('IAggregatorV3Interface');
  let wethOracle = await smock.fake<IAggregatorV3Interface>('IAggregatorV3Interface');

  return { usdcOracle, wethOracle }
}

const initVaults = async (
  baseSushiVault: BaseSushiVault,
  vaultTest: VaultTest,
  _owner: string,
  _rageClearingHouse: string,
  _rageCollateralToken: string,
  _rageBaseToken: string,
  _sushiParams: SushiParamsStruct
) => {

  await (await baseSushiVault.initialize(
    _owner,
    _rageClearingHouse,
    _rageCollateralToken,
    _rageBaseToken,
    _sushiParams
  )).wait();

  await (await vaultTest.initialize(
    _owner,
    _rageClearingHouse,
    _rageCollateralToken,
    _rageBaseToken,
    _sushiParams
  )).wait();
}

before(async () => {

  await activateMainnetFork({
    blockNumber: arbConstants.BLOCK,
    network: 'arbitrum-mainnet'
  });

})

after(async () => {
  await deactivateMainnetFork();
})

describe('# Main', () => {

  let vBase: IVBase
  let vToken: IVToken
  let realBase: IERC20
  let realToken: IWETH
  let clearingHouse: ClearingHouse
  let oracle: IOracle
  let vPool: IUniswapV3Pool
  let vPoolWrapper: IVPoolWrapper

  let uniV2Factory: IUniswapV2Factory
  let uniV2Router: IUniswapV2Router02
  let sushiChef: IMiniChefV2
  let weth: IWETH
  let usdc: IERC20
  let wethUsdc: IUniswapV2Pair
  let sushiToken: IERC20

  let usdcOracle: FakeContract<IAggregatorV3Interface>
  let wethOracle: FakeContract<IAggregatorV3Interface>

  let baseSushiVault: BaseSushiVault
  let vaultTest: VaultTest

  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  describe('# Setup & Deployments', () => {

    it('- deploying and creating accounts...', async () => {

      ({
        vBase,
        vToken,
        realBase,
        realToken,
        clearingHouse,
        oracle,
        vPool,
        vPoolWrapper
      } = await deployAndSetupCore());

      ({
        uniV2Factory,
        uniV2Router,
        sushiChef,
        weth,
        usdc,
        wethUsdc,
        sushiToken
      } = await deployAndSetupHelpers());

      ({ baseSushiVault, vaultTest } = await deployAndSetupVault(vToken.address));

      ({ admin, alice, bob, carol } = await createUsers());

      ({ usdcOracle, wethOracle } = await deployAndSetupChainlinkOralces());
    })

    it('- should deploy without reverts', async () => {

      assert(vBase.address !== '0x0000000000000000000000000000000000000000', 'vBase');
      assert(vToken.address !== '0x0000000000000000000000000000000000000000', 'vToken');
      assert(realBase.address !== '0x0000000000000000000000000000000000000000', 'realBase');
      assert(realToken.address !== '0x0000000000000000000000000000000000000000', 'realToken');
      assert(clearingHouse.address !== '0x0000000000000000000000000000000000000000', 'clearingHouse');
      assert(oracle.address !== '0x0000000000000000000000000000000000000000', 'oracle');
      assert(vPool.address !== '0x0000000000000000000000000000000000000000', 'vPool');
      assert(vPoolWrapper.address !== '0x0000000000000000000000000000000000000000', 'vPoolWrapper');

      assert(uniV2Factory.address !== '0x0000000000000000000000000000000000000000', 'uniV2Factory');
      assert(uniV2Router.address !== '0x0000000000000000000000000000000000000000', 'uniV2Router');
      assert(sushiChef.address !== '0x0000000000000000000000000000000000000000', 'sushiChef');
      assert(weth.address !== '0x0000000000000000000000000000000000000000', 'weth');
      assert(usdc.address !== '0x0000000000000000000000000000000000000000', 'usdc');
      assert(wethUsdc.address !== '0x0000000000000000000000000000000000000000', 'wethUsdc');
      assert(sushiToken.address !== '0x0000000000000000000000000000000000000000', 'sushiToken');

      assert(baseSushiVault.address !== '0x0000000000000000000000000000000000000000', 'baseSushiVault');
    })

    it('- shoud set params correclty', async () => {
      // increases cardinality for twap
      await vPool.increaseObservationCardinalityNext(100);

      clearingHouse.addCollateralSupport(realBase.address, usdcOracle.address, 300);

      const block = await hre.ethers.provider.getBlock('latest');

      usdcOracle.latestRoundData.returns([0, 10n ** 8n, 0, block.timestamp, 0]);
      wethOracle.latestRoundData.returns([0, 3000n * 10n ** 8n, 0, block.timestamp, 0]);

      usdcOracle.decimals.returns(8);
      wethOracle.decimals.returns(8);

      const liquidationParams = {
        liquidationFeeFraction: 1500,
        tokenLiquidationPriceDeltaBps: 3000,
        insuranceFundFeeShareBps: 5000,
      };

      const minRequiredMargin = tokenAmount(20, 6);
      const removeLimitOrderFee = tokenAmount(10, 6);
      const minimumOrderNotional = tokenAmount(1, 6).div(100);

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
    })

    it('- shoud have default vaules because of no accounting actions', async () => {

      expect(await wethUsdc.token0()).eq(weth.address);
      expect(await wethUsdc.token1()).eq(usdc.address);

      await initVaults(
        baseSushiVault,
        vaultTest,
        admin.address,
        clearingHouse.address,
        weth.address,
        usdc.address,
        {
          sushiRouter: uniV2Router.address,
          sushiPair: wethUsdc.address,
          sushiChef: sushiChef.address,
          token0: await wethUsdc.token0(),
          token1: await wethUsdc.token1(),
          rewardToken: sushiToken.address,
          token0Oracle: wethOracle.address,
          token1Oracle: usdcOracle.address,
          maxOracleDelayTime: 10 ** 6,
        }
      )

      const pairDecimals = BigNumber.from(10).pow(await wethUsdc.decimals());
      const zeroBg = BigNumber.from(0);

      expect(await baseSushiVault.name()).eq(arbConstants.VAULT_NAME);
      expect(await baseSushiVault.symbol()).eq(arbConstants.VAULT_SYMBOL);

      expect(await baseSushiVault.asset()).eq(arbConstants.WETH_USDC_PAIR);
      expect(await baseSushiVault.assetsOf(admin.address)).eq(zeroBg);

      expect(await baseSushiVault.assetsPerShare()).eq(await baseSushiVault.previewRedeem(pairDecimals));
      expect(await baseSushiVault.assetsPerShare()).eq(pairDecimals);
      expect(await baseSushiVault.totalAssets()).eq(zeroBg);
      expect(await baseSushiVault.balanceOf(admin.address)).eq(zeroBg);

      expect(await baseSushiVault.getPriceX128()).not.eq(BigNumber.from(0));
      expect(await baseSushiVault.getMarketValue(BigNumber.from(1000))).eq(BigNumber.from(0));
      expect(await baseSushiVault.getVaultMarketValue()).eq(BigNumber.from(0));

      expect(await baseSushiVault.previewMint(pairDecimals.mul(2))).eq(pairDecimals.mul(2));
      expect(await baseSushiVault.previewDeposit(pairDecimals.mul(2))).eq(pairDecimals.mul(2));

      expect(await baseSushiVault.previewRedeem(pairDecimals.mul(2))).eq(pairDecimals.mul(2));
      expect(await baseSushiVault.previewWithdraw(pairDecimals.mul(2))).eq(pairDecimals.mul(2));
    })

    it('- cannot init twice', async () => {
      await expect(initVaults(
        baseSushiVault,
        vaultTest,
        admin.address,
        clearingHouse.address,
        weth.address,
        usdc.address,
        {
          sushiRouter: uniV2Router.address,
          sushiPair: wethUsdc.address,
          sushiChef: sushiChef.address,
          token0: await wethUsdc.token0(),
          token1: await wethUsdc.token1(),
          rewardToken: sushiToken.address,
          token0Oracle: wethOracle.address,
          token1Oracle: usdcOracle.address,
          maxOracleDelayTime: 10 ** 6,
        }
      )).to.revertedWith('Initializable: contract is already initialized');
    })

  })

  describe('# Allowances', () => { })

  describe('# Deposit', () => {
    it('- should increase bal on transfer', async () => {
      const pairDecimals = BigNumber.from(10).pow(await wethUsdc.decimals());

      const balBefore = await wethUsdc.balanceOf(alice.address);

      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [arbConstants.WETH_USDC_WHALE],
      });

      const signer = await hre.ethers.getSigner(arbConstants.WETH_USDC_WHALE);
      const erc20 = await hre.ethers.getContractAt('IERC20', wethUsdc.address, signer);

      await erc20.transfer(alice.address, BigNumber.from('241502161737011795'));

      const balAfter = await wethUsdc.balanceOf(alice.address);
      expect(balAfter.sub(balBefore)).eq(BigNumber.from('241502161737011795'));
    })

    it('- should deposit and mint vault tokens', async () => {

      let vault = baseSushiVault.connect(alice)
      let token = wethUsdc.connect(alice);
      token.approve(vault.address, '241502161737011795');

      const decimals = BigNumber.from(10).pow(await vault.decimals());
      const balBefore = await vault.balanceOf(alice.address)
      // console.log(balBefore)

      await vault.deposit('241502161737011795', alice.address, {
        from: alice.address
      });

      const balAfter = await vault.balanceOf(alice.address);
      // console.log(balAfter)

      // expect(balAfter.sub(balBefore)).eq(decimals.mul(10_000));
    })

  })

  describe('# Withdraw', () => { })

  describe('# Pricing', () => { })

  describe('# Stake', () => { })

  describe('# Harvest', () => { })

  describe('# Before hooks', () => { })

  describe('# After hooks', () => { })

})
