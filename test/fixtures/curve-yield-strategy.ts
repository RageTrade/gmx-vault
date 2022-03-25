import { deployments } from 'hardhat';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';

import { rageTradeFixture } from './ragetrade-core';

export const curveYieldStrategyFixture = deployments.createFixture(async hre => {
  const { clearingHouse, settlementToken } = await rageTradeFixture();

  const lpToken = (await (
    await hre.ethers.getContractFactory('@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20')
  ).deploy('LPToken', 'LPT')) as ERC20;
  const curveYieldStrategyTest = await (
    await hre.ethers.getContractFactory('CurveYieldStrategyTest')
  ).deploy(lpToken.address);

  const dummyCollateral = (await (
    await hre.ethers.getContractFactory('@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20')
  ).deploy('Dummy Collateral', 'DCT')) as ERC20;

  const usdc = (await (
    await hre.ethers.getContractFactory('@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20')
  ).deploy('USDC', 'USDC')) as ERC20;

  const crvToken = (await await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    '0xD533a949740bb3306d119CC777fa900bA034cd52',
  )) as ERC20;

  const [signer] = await hre.ethers.getSigners();
  // await curveYieldStrategyTest.initialize(
  //   signer.address,
  //   clearingHouse.address,
  //   dummyCollateral.address,
  //   settlementToken.address,
  //   usdc.address,
  //   crvToken.address,
  //   'guage',
  //   'swaprouter',
  //   'lp price holder',
  //   'curve stable swap ',
  // );
  return { curveYieldStrategyTest, usdc, crvToken };
});
