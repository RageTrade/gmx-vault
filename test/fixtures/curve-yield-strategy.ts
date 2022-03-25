import { deployments } from 'hardhat';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20/ERC20';

import { setupRageTrade } from './ragetrade-core';

export const setupCurveYieldStrategy = deployments.createFixture(async hre => {
  const { clearingHouse, settlementToken } = await setupRageTrade();

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

  const crv = (await (
    await hre.ethers.getContractFactory('@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20')
  ).deploy('crv', 'crv')) as ERC20;

  const [signer] = await hre.ethers.getSigners();
  curveYieldStrategyTest.initialize(
    signer.address,
    clearingHouse.address,
    dummyCollateral.address,
    settlementToken.address,
    usdc.address,
    crv.address,
    'guage',
    'swaprouter',
    'lp price holder',
    'curve stable swap ',
  );
  return { curveYieldStrategyTest };
});
