import { deployments } from 'hardhat';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';

import { eightyTwentyRangeStrategyFixture } from './eighty-twenty-range-strategy-vault';
import addresses from './addresses';
import { BigNumber } from 'ethers';
import { parseTokenAmount } from '@ragetrade/core/test/utils/stealFunds';

export const curveYieldStrategyFixture = deployments.createFixture(async hre => {
  const { clearingHouse, collateralToken, settlementToken, ethPoolId, settlementTokenTreasury } =
    await eightyTwentyRangeStrategyFixture();

  const lpToken = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.TRICRYPTO_LP_TOKEN,
  )) as ERC20;

  const usdc = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.USDC,
  )) as ERC20;

  const usdt = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.USDT,
  )) as ERC20;

  const weth = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.WETH,
  )) as ERC20;

  const crv = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.CRV,
  )) as ERC20;

  const triCrypto = (await hre.ethers.getContractAt(
    'contracts/interfaces/curve/ICurveStableSwap.sol:ICurveStableSwap',
    addresses.CRV,
  )) as ERC20;

  const curveYieldStrategyTest = await (
    await hre.ethers.getContractFactory('CurveYieldStrategyTest')
  ).deploy(lpToken.address);

  await collateralToken.grantRole(await collateralToken.MINTER_ROLE(), curveYieldStrategyTest.address);

  await settlementToken
    .connect(settlementTokenTreasury)
    .approve(curveYieldStrategyTest.address, parseTokenAmount(10n ** 10n, 18));

  await collateralToken
    .connect(settlementTokenTreasury)
    .approve(clearingHouse.address, parseTokenAmount(10n ** 10n, 18));

  await collateralToken.approve(clearingHouse.address, parseTokenAmount(10n ** 10n, 18));

  await settlementToken.approve(clearingHouse.address, parseTokenAmount(10n ** 5n, 6));

  const [signer, user1, user2] = await hre.ethers.getSigners();

  await curveYieldStrategyTest.initialize(
    signer.address,
    clearingHouse.address,
    collateralToken.address,
    settlementToken.address,
    addresses.USDT,
    addresses.USDC,
    addresses.WETH,
    addresses.CRV,
    addresses.GAUGE,
    addresses.ROUTER,
    addresses.QUOTER,
    addresses.TRICRYPTO_POOL,
  );

  return {
    crv,
    usdt,
    usdc,
    weth,
    lpToken,
    triCrypto,
    curveYieldStrategyTest,
  };
});
