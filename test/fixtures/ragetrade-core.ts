import {
  IClearingHouseStructures,
  VTokenDeployer,
  RageTradeFactory as RageTradeFactoryNamespace,
} from '@ragetrade/core/typechain-types/contracts/protocol/RageTradeFactory';
import { deployments } from 'hardhat';

export const setupRageTrade = deployments.createFixture(async hre => {
  const rageTradeDeployments = await deployments.fixture('RageTradeFactory');

  const rageTradeFactory = await hre.ethers.getContractAt(
    'RageTradeFactory',
    rageTradeDeployments.RageTradeFactory.address,
  );
  const clearingHouse = await hre.ethers.getContractAt('ClearingHouse', rageTradeDeployments.ClearingHouse.address);
  const settlementToken = await hre.ethers.getContractAt(
    'SettlementTokenMock',
    rageTradeDeployments.SettlementToken.address,
  );

  const pool0 = await initializePool();
  const pool1 = await initializePool();

  return { rageTradeFactory, rageTradeDeployments, clearingHouse, settlementToken, pool0, pool1 };

  async function initializePool() {
    const oracle = await (await hre.ethers.getContractFactory('OracleMock')).deploy();
    const deployVTokenParams: VTokenDeployer.DeployVTokenParamsStruct = {
      vTokenName: 'Virtual Ether (Rage Trade)',
      vTokenSymbol: 'vETH',
      cTokenDecimals: 18,
    };

    const poolInitialSettings: IClearingHouseStructures.PoolSettingsStruct = {
      initialMarginRatioBps: 2000,
      maintainanceMarginRatioBps: 1000,
      maxVirtualPriceDeviationRatioBps: 1000, // 10%
      twapDuration: 300,
      isAllowedForTrade: true,
      isCrossMargined: true,
      oracle: oracle.address,
    };

    const params: RageTradeFactoryNamespace.InitializePoolParamsStruct = {
      deployVTokenParams,
      poolInitialSettings,
      liquidityFeePips: 1000,
      protocolFeePips: 500,
      slotsToInitialize: 100,
    };

    const tx = await rageTradeFactory.initializePool(params);

    const events = await rageTradeFactory.queryFilter(
      rageTradeFactory.filters.PoolInitialized(),
      tx.blockNumber,
      tx.blockNumber,
    );

    const event = events[events.length - 1];

    const vToken = await hre.ethers.getContractAt('VToken', event.args.vToken);
    const vPool = await hre.ethers.getContractAt('IUniswapV3Pool', event.args.vPool);
    const vPoolWrapper = await hre.ethers.getContractAt('VPoolWrapper', event.args.vPoolWrapper);

    return { vToken, vPool, vPoolWrapper, oracle };
  }
});
