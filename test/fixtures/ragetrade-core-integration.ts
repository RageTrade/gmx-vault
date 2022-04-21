import { BigNumber } from 'ethers';
import { deployments } from 'hardhat';

import {
  IClearingHouseStructures,
  RageTradeFactory as RageTradeFactoryNamespace,
  VTokenDeployer,
} from '../../typechain-types/artifacts/@ragetrade/core/contracts/protocol/RageTradeFactory';
import { priceToPriceX128 } from '@ragetrade/sdk';
import addresses from './addresses';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';
import { ClearingHouse } from '@ragetrade/sdk/dist/typechain/core';

export const rageTradeFixture = deployments.createFixture(async hre => {
  const rageTradeDeployments = await deployments.fixture('RageTradeFactoryArbitrum');

  const rageTradeFactory = await hre.ethers.getContractAt(
    'RageTradeFactory',
    rageTradeDeployments.RageTradeFactoryArbitrum.address,
  );
  const clearingHouse = (await hre.ethers.getContractAt(
    '@ragetrade/core/contracts/protocol/clearinghouse/ClearingHouse.sol:ClearingHouse',
    rageTradeDeployments.ClearingHouseArbitrum.address,
  )) as ClearingHouse;
  const settlementToken = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.USDC,
  )) as ERC20;

  // Set price to update init price of vpool
  const priceX128 = await priceToPriceX128(4000, 6, 18);
  const pool0 = await initializePool(priceX128);
  const pool1 = await initializePool(priceX128);

  return { rageTradeFactory, rageTradeDeployments, clearingHouse, settlementToken, pool0, pool1 };

  async function initializePool(priceX128: BigNumber) {
    const oracle = await (await hre.ethers.getContractFactory('OracleMock')).deploy();
    await oracle.setPriceX128(priceX128);
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
