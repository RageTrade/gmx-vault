import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { IERC20Metadata__factory, priceToPriceX128 } from '@ragetrade/sdk';

import { IUniswapV3Pool__factory, VPoolWrapper__factory, VToken__factory } from '../../typechain-types';
import {
  IClearingHouseStructures,
  PoolInitializedEvent,
  RageTradeFactory,
  VTokenDeployer,
} from '../../typechain-types/artifacts/@ragetrade/core/contracts/protocol/RageTradeFactory';
import { getNetworkInfo } from '../network-info';
import { ethers } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy, execute, save },
    getNamedAccounts,
  } = hre;

  const { RAGE_ETH_VTOKEN_ADDRESS } = getNetworkInfo(hre.network.config.chainId ?? 31337);
  if (RAGE_ETH_VTOKEN_ADDRESS) {
    await save('ETH-vToken', { abi: IERC20Metadata__factory.abi, address: RAGE_ETH_VTOKEN_ADDRESS });
    console.log('Skipping vETH.ts deployment, using ETH-vToken from @ragetrade/core');
    return;
  }

  let alreadyDeployed = false;

  try {
    await get('ETH-vToken');
    alreadyDeployed = true;
  } catch (e) {
    console.log((e as Error).message);
  }

  if (!alreadyDeployed) {
    const { deployer } = await getNamedAccounts();

    let ethIndexOracleDeployment;
    const oracleAddress = getNetworkInfo(hre.network.config.chainId).ETH_USD_ORACLE;

    if (oracleAddress) {
      ethIndexOracleDeployment = await deploy('ETH-IndexOracle', {
        contract: 'ChainlinkOracle',
        args: [oracleAddress, ethers.constants.AddressZero, 18, 6],
        from: deployer,
        log: true,
      });
    } else {
      ethIndexOracleDeployment = await deploy('ETH-IndexOracle', {
        contract: 'OracleMock',
        from: deployer,
        log: true,
      });
      await execute('ETH-IndexOracle', { from: deployer }, 'setPriceX128', await priceToPriceX128(3000, 6, 18));
    }

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
      oracle: ethIndexOracleDeployment.address,
    };

    const params: RageTradeFactory.InitializePoolParamsStruct = {
      deployVTokenParams,
      poolInitialSettings,
      liquidityFeePips: 1000,
      protocolFeePips: 500,
      slotsToInitialize: 100,
    };

    const tx = await execute('RageTradeFactory', { from: deployer }, 'initializePool', params);

    const poolInitializedLog = tx.events?.find(
      event => event?.event === 'PoolInitialized',
    ) as unknown as PoolInitializedEvent;
    if (!poolInitializedLog) {
      throw new Error('PoolInitialized log not found');
    }

    await save('ETH-vToken', { abi: VToken__factory.abi, address: poolInitializedLog.args.vToken });
    console.log('saved "ETH-vToken":', poolInitializedLog.args.vToken);

    await save('ETH-vPool', {
      abi: IUniswapV3Pool__factory.abi,
      address: poolInitializedLog.args.vPool,
    });
    console.log('saved "ETH-vPool":', poolInitializedLog.args.vPool);

    await save('ETH-vPoolWrapper', { abi: VPoolWrapper__factory.abi, address: poolInitializedLog.args.vPoolWrapper });
    console.log('saved "ETH-vPoolWrapper":', poolInitializedLog.args.vPoolWrapper);
  }
};

export default func;

// Only will be deployed on hardhat network
func.skip = async hre => hre.network.config.chainId !== 31337;

func.tags = ['vETH'];
func.dependencies = ['RageTradeFactory'];
