import { parseUnits } from 'ethers/lib/utils';
import hre from 'hardhat';
import {
  IUniswapV3Pool__factory,
  RageTradeFactory,
  VPoolWrapperMockRealistic__factory,
  VToken__factory,
} from '../../typechain-types';
import {
  DeployVTokenParamsStruct,
  InitializePoolParamsStruct,
  PoolSettingsStruct,
} from '../../typechain-types/RageTradeFactory';

// type ArgumentTypes<F extends Function> = F extends (...args: infer A) => any ? A : never;

export class RageTradeSetup {
  // _ready: Promise<void>;
  rageTradeFactory?: RageTradeFactory;
  snapshotId?: number;

  constructor() {
    // this._ready = this.setup();
  }

  setup = async () => {
    await this.deployContracts();
  };

  // takeSnapshot = async () => {
  //   this.snapshotId = await hre.ethers.provider.send('evm_snapshot', []);
  // };

  // reset = async () => {
  //   // await this.ready();
  //   if (this.snapshotId === undefined) throw new Error('RageTradeFixture not setup');
  //   await hre.network.provider.send('evm_revert', [this.snapshotId]);
  //   this.snapshotId = await hre.ethers.provider.send('evm_snapshot', []);
  // };

  getContracts = async () => {
    if (this.rageTradeFactory === undefined) throw new Error('RageTradeFixture not setup');

    const vQuote = await hre.ethers.getContractAt('VQuote', await this.rageTradeFactory.vQuote());
    const clearingHouse = await hre.ethers.getContractAt('ClearingHouse', await this.rageTradeFactory.clearingHouse());
    const proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', await this.rageTradeFactory.proxyAdmin());
    const protocolInfo = await clearingHouse.protocolInfo();
    const settlementToken = await hre.ethers.getContractAt('SettlementTokenMock', protocolInfo.settlementToken);
    const pools = await this.getPoolContracts();
    return { vQuote, settlementToken, clearingHouse, proxyAdmin, pools };
  };

  async getPoolContracts() {
    if (this.rageTradeFactory === undefined) throw new Error('RageTradeFixture not setup');

    const events = await this.rageTradeFactory.queryFilter(this.rageTradeFactory.filters.PoolInitialized());
    return events.map(({ args: { vToken, vPool, vPoolWrapper } }) => {
      if (this.rageTradeFactory === undefined) throw new Error('RageTradeFixture not setup');
      const signerOrProvider = this.rageTradeFactory.signer ?? this.rageTradeFactory.provider;
      return {
        vToken: VToken__factory.connect(vToken, signerOrProvider),
        vPool: IUniswapV3Pool__factory.connect(vPool, signerOrProvider),
        vPoolWrapper: VPoolWrapperMockRealistic__factory.connect(vPoolWrapper, signerOrProvider),
      };
    });
  }

  /**
   * Deploys all the Rage Trade contracts and deploys two pools
   */
  async deployContracts() {
    // deploying logic
    const accountLib = await (await hre.ethers.getContractFactory('Account')).deploy();
    const clearingHouseLogic = await (
      await hre.ethers.getContractFactory('ClearingHouse', {
        libraries: {
          Account: accountLib.address,
        },
      })
    ).deploy();
    const insuranceFundLogic = await (await hre.ethers.getContractFactory('InsuranceFund')).deploy();
    const vPoolWrapperLogic = await (await hre.ethers.getContractFactory('VPoolWrapperMockRealistic')).deploy();
    const settlementToken = await (await hre.ethers.getContractFactory('SettlementTokenMock')).deploy();

    // deploying rage trade factory
    const rageTradeFactory = await (
      await hre.ethers.getContractFactory('RageTradeFactory')
    ).deploy(
      clearingHouseLogic.address,
      vPoolWrapperLogic.address,
      insuranceFundLogic.address,
      settlementToken.address,
    );
    this.rageTradeFactory = rageTradeFactory;

    // updating protocol settings
    const { clearingHouse } = await this.getContracts();
    await clearingHouse.updateProtocolSettings(
      {
        rangeLiquidationFeeFraction: 1500,
        tokenLiquidationFeeFraction: 3000,
        insuranceFundFeeShareBps: 5000,
        maxRangeLiquidationFees: 100000000,
        closeFactorMMThresholdBps: 7500,
        partialLiquidationCloseFactorBps: 5000,
        liquidationSlippageSqrtToleranceBps: 150,
        minNotionalLiquidatable: 100000000,
      },
      parseUnits('10', 6), // removeLimitOrderFee
      parseUnits('1', 6).div(100), // minimumOrderNotional
      parseUnits('20', 6), // minRequiredMargin)
    );

    // deploy pool 1
    await this.initializePool();

    // deploy pool 2
    await this.initializePool();
  }

  async initializePool() {
    const oracle = await (await hre.ethers.getContractFactory('OracleMock')).deploy();

    const deployVTokenParams: DeployVTokenParamsStruct = {
      vTokenName: 'Virtual Ether (Rage Trade)',
      vTokenSymbol: 'vETH',
      cTokenDecimals: 18,
    };

    const poolInitialSettings: PoolSettingsStruct = {
      initialMarginRatioBps: 2000,
      maintainanceMarginRatioBps: 1000,
      maxVirtualPriceDeviationRatioBps: 1000, // 10%
      twapDuration: 300,
      isAllowedForTrade: true,
      isCrossMargined: true,
      oracle: oracle.address,
    };

    const params: InitializePoolParamsStruct = {
      deployVTokenParams,
      poolInitialSettings,
      liquidityFeePips: 1000,
      protocolFeePips: 500,
      slotsToInitialize: 100,
    };

    if (this.rageTradeFactory === undefined) throw new Error('RageTradeFixture not setup');
    await this.rageTradeFactory.initializePool(params);
  }
}
