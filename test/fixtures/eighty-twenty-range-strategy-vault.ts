import { priceToPriceX128 } from '@ragetrade/core/test/utils/price-tick';
import { parseTokenAmount } from '@ragetrade/core/test/utils/stealFunds';
import { truncate } from '@ragetrade/core/test/utils/vToken';
import { deployments } from 'hardhat';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';
import { updateSettlementTokenMargin } from '../utils/rageHelpers';

import { rageTradeFixture } from './ragetrade-core';

export const eightyTwentyRangeStrategyFixture = deployments.createFixture(async hre => {
  const { clearingHouse, settlementToken, pool0 } = await rageTradeFixture();

  // set price in pool0 @leaddev - setting price here would not change the price in vpool so moving it back into ragetrade-core
  // const initialPriceX128 = await priceToPriceX128(4000, 6, 18);
  // await pool0.oracle.setPriceX128(initialPriceX128);

  const tokenFactory = await hre.ethers.getContractFactory('ERC20PresetMinterPauserUpgradeable');
  const collateralToken = await tokenFactory.deploy();
  await collateralToken.initialize('Collateral Token', 'CT');
  const yieldToken = await tokenFactory.deploy();
  await yieldToken.initialize('Yield Token', 'YT');

  const eightyTwentyRangeStrategyVaultTest = await (
    await hre.ethers.getContractFactory('EightyTwentyRangeStrategyVaultTest')
  ).deploy(yieldToken.address, 'Vault Token', 'VT', truncate(pool0.vToken.address));

  const ethPoolId = truncate(pool0.vToken.address);
  const pool = await clearingHouse.getPoolInfo(truncate(pool0.vToken.address));

  const [admin, user0, user1, trader0, settlementTokenTreasury] = await hre.ethers.getSigners();

  const closePositionToleranceBps = 500; //5%
  const resetPositionThresholdBps = 2000; //20%
  const minNotionalPositionToCloseThreshold = parseTokenAmount(100, 6);
  const collateralTokenPriceX128 = await priceToPriceX128(1, 6, 18);
  await eightyTwentyRangeStrategyVaultTest.initialize(
    admin.address,
    clearingHouse.address,
    collateralToken.address,
    settlementToken.address,
    closePositionToleranceBps,
    resetPositionThresholdBps,
    collateralTokenPriceX128,
    settlementTokenTreasury.address,
    minNotionalPositionToCloseThreshold,
  );
  await eightyTwentyRangeStrategyVaultTest.grantAllowances();
  collateralToken.grantRole(await collateralToken.MINTER_ROLE(), eightyTwentyRangeStrategyVaultTest.address);
  const collateralTokenOracle = await (await hre.ethers.getContractFactory('OracleMock')).deploy();

  await clearingHouse.updateCollateralSettings(collateralToken.address, {
    oracle: collateralTokenOracle.address,
    twapDuration: 300,
    isAllowedForDeposit: true,
  });

  const vaultAccountNo = await eightyTwentyRangeStrategyVaultTest.rageAccountNo();
  await yieldToken.mint(user0.address, parseTokenAmount(10n ** 10n, 18));
  await yieldToken.connect(user0).approve(eightyTwentyRangeStrategyVaultTest.address, parseTokenAmount(10n ** 10n, 18));

  await yieldToken.mint(user1.address, parseTokenAmount(10n ** 10n, 18));
  await yieldToken.connect(user1).approve(eightyTwentyRangeStrategyVaultTest.address, parseTokenAmount(10n ** 10n, 18));

  await settlementToken.mint(settlementTokenTreasury.address, parseTokenAmount(10n ** 20n, 18));
  await settlementToken.mint(admin.address, parseTokenAmount(10n ** 20n, 18));

  await settlementToken
    .connect(settlementTokenTreasury)
    .approve(eightyTwentyRangeStrategyVaultTest.address, parseTokenAmount(10n ** 20n, 18));

  await clearingHouse.createAccount();
  const adminAccountNo = (await clearingHouse.numAccounts()).sub(1);

  await clearingHouse.connect(trader0).createAccount();
  const trader0AccountNo = (await clearingHouse.numAccounts()).sub(1);
  settlementToken.mint(trader0.address, parseTokenAmount(10n ** 7n, 6));
  await updateSettlementTokenMargin(
    clearingHouse,
    settlementToken,
    trader0,
    trader0AccountNo,
    parseTokenAmount(10n ** 7n, 6),
  );

  await settlementToken.approve(clearingHouse.address, parseTokenAmount(10n ** 5n, 6));
  await clearingHouse.updateMargin(adminAccountNo, truncate(settlementToken.address), parseTokenAmount(10n ** 5n, 6));
  await clearingHouse.updateRangeOrder(adminAccountNo, ethPoolId, {
    liquidityDelta: 10n ** 9n,
    tickLower: -220000,
    tickUpper: -170000,
    closeTokenPosition: false,
    sqrtPriceCurrent: 0,
    slippageToleranceBps: 0,
    limitOrderType: 0,
  });

  return {
    eightyTwentyRangeStrategyVaultTest,
    clearingHouse,
    collateralToken,
    collateralTokenOracle,
    yieldToken,
    settlementToken,
    vaultAccountNo,
    settlementTokenTreasury,
    ethPoolId,
    ethPool: pool0,
    user0,
    user1,
    trader0,
    trader0AccountNo,
  };
});
