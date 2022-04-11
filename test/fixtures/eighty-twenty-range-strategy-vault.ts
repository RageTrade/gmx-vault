import { deployments } from 'hardhat';

import { parseTokenAmount, priceToPriceX128, truncate } from '@ragetrade/sdk';

import { updateSettlementTokenMargin } from '../utils/rage-helpers';
import { rageTradeFixture } from './ragetrade-core';
import { ethers } from 'ethers';

export const eightyTwentyRangeStrategyFixture = deployments.createFixture(async hre => {
  const { clearingHouse, settlementToken, pool0 } = await rageTradeFixture();

  // set price in pool0 @leaddev - setting price here would not change the price in vpool so moving it back into ragetrade-core
  // const initialPriceX128 = await priceToPriceX128(4000, 6, 18);
  // await pool0.oracle.setPriceX128(initialPriceX128);

  const tokenFactory = await hre.ethers.getContractFactory('ERC20PresetMinterPauser');
  const collateralToken = await tokenFactory.deploy('Collateral Token', 'CT');
  const yieldToken = await tokenFactory.deploy('Yield Token', 'YT');

  const [admin, user0, user1, trader0, settlementTokenTreasury] = await hre.ethers.getSigners();

  const ethPoolId = truncate(pool0.vToken.address);
  const pool = await clearingHouse.getPoolInfo(truncate(pool0.vToken.address));

  const closePositionSlippageSqrtToleranceBps = 500; //5%
  const resetPositionThresholdBps = 2000; //20%
  const minNotionalPositionToCloseThreshold = parseTokenAmount(100, 6);
  const collateralTokenPriceX128 = await priceToPriceX128(1, 6, 18);
  // await eightyTwentyRangeStrategyVaultTest.initialize(
  //   admin.address,
  //   clearingHouse.address,
  //   collateralToken.address,
  //   settlementToken.address,
  //   closePositionToleranceBps,
  //   resetPositionThresholdBps,
  //   collateralTokenPriceX128,
  //   settlementTokenTreasury.address,
  //   minNotionalPositionToCloseThreshold,
  // );

  const swapManager = await (await hre.ethers.getContractFactory('SwapManager')).deploy();
  const logic = await (
    await hre.ethers.getContractFactory('Logic', {
      libraries: {
        ['contracts/libraries/SwapManager.sol:SwapManager']: swapManager.address,
      },
    })
  ).deploy();

  const eightyTwentyRangeStrategyVaultTest = await (
    await hre.ethers.getContractFactory('EightyTwentyRangeStrategyVaultTest', {
      libraries: {
        ['contracts/libraries/Logic.sol:Logic']: logic.address,
      },
    })
  ).deploy(
    {
      baseVaultInitParams: {
        rageErc4626InitParams: {
          asset: yieldToken.address,
          name: 'Vault Token',
          symbol: 'VT',
        },
        ethPoolId,
        // owner: admin.address,
        rageClearingHouse: clearingHouse.address,
        rageCollateralToken: collateralToken.address,
        rageSettlementToken: settlementToken.address,
      },
      closePositionSlippageSqrtToleranceBps,
      resetPositionThresholdBps,
      minNotionalPositionToCloseThreshold,
    },
    collateralTokenPriceX128,
    settlementTokenTreasury.address,
  );

  eightyTwentyRangeStrategyVaultTest.setKeeper(admin.address);
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
  await yieldToken.mint(settlementTokenTreasury.address, parseTokenAmount(10n ** 20n, 18));

  await settlementToken.mint(admin.address, parseTokenAmount(10n ** 20n, 18));

  await settlementToken
    .connect(settlementTokenTreasury)
    .approve(eightyTwentyRangeStrategyVaultTest.address, parseTokenAmount(10n ** 20n, 18));

  await yieldToken
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

  await eightyTwentyRangeStrategyVaultTest.updateDepositCap(parseTokenAmount(10n ** 10n, 18));

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
    admin,
    adminAccountNo,
  };
});
