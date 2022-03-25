import { priceToPriceX128 } from '@ragetrade/core/test/utils/price-tick';
import { parseTokenAmount } from '@ragetrade/core/test/utils/stealFunds';
import { truncate } from '@ragetrade/core/test/utils/vToken';
import { deployments } from 'hardhat';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';

import { setupRageTrade } from './ragetrade-core';

export const setupEightyTwentyRangeStrategy = deployments.createFixture(async hre => {
  const { clearingHouse, settlementToken, pool0 } = await setupRageTrade();

  // set price in pool0
  const initialPriceX128 = await priceToPriceX128(4000, 6, 18);
  await pool0.oracle.setPriceX128(initialPriceX128);

  const tokenFactory = await hre.ethers.getContractFactory('ERC20PresetMinterPauserUpgradeable');
  const collateralToken = await tokenFactory.deploy();
  await collateralToken.initialize('Collateral Token', 'CT');
  const yieldToken = await tokenFactory.deploy();
  await yieldToken.initialize('Yield Token', 'YT');

  const eightyTwentyRangeStrategyVaultTest = await (
    await hre.ethers.getContractFactory('EightyTwentyRangeStrategyVaultTest')
  ).deploy(yieldToken.address, 'Vault Token', 'VT', truncate(pool0.vToken.address));

  const pool = await clearingHouse.getPoolInfo(truncate(pool0.vToken.address));

  const [admin, user0, user1, settlementTokenTreasury] = await hre.ethers.getSigners();

  const closePositionToleranceBps = 500; //5%
  const resetPositionThresholdBps = 2000; //20%
  await eightyTwentyRangeStrategyVaultTest.initialize(
    admin.address,
    clearingHouse.address,
    collateralToken.address,
    settlementToken.address,
    closePositionToleranceBps,
    resetPositionThresholdBps,
    1n << 128n,
    settlementTokenTreasury.address,
  );
  await eightyTwentyRangeStrategyVaultTest.grantAllowances();
  collateralToken.grantRole(await collateralToken.MINTER_ROLE(), eightyTwentyRangeStrategyVaultTest.address);
  const collateralTokenOracle = await (await hre.ethers.getContractFactory('OracleMock')).deploy();

  await clearingHouse.updateCollateralSettings(collateralToken.address, {
    oracle: collateralTokenOracle.address,
    twapDuration: 300,
    isAllowedForDeposit: true,
  });

  const vaultRageAccountNo = await eightyTwentyRangeStrategyVaultTest.rageAccountNo();
  await yieldToken.mint(user0.address, parseTokenAmount(10n ** 10n, 18));
  await yieldToken.connect(user0).approve(eightyTwentyRangeStrategyVaultTest.address, parseTokenAmount(10n ** 10n, 18));

  await settlementToken.mint(settlementTokenTreasury.address, parseTokenAmount(10n ** 20n, 18));
  await settlementToken
    .connect(settlementTokenTreasury)
    .approve(eightyTwentyRangeStrategyVaultTest.address, parseTokenAmount(10n ** 20n, 18));

  return {
    eightyTwentyRangeStrategyVaultTest,
    collateralToken,
    collateralTokenOracle,
    yieldToken,
    settlementToken,
    vaultRageAccountNo,
  };
});
