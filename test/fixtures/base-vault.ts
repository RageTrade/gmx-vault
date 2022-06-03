import { BaseVaultTest__factory } from '@ragetrade/sdk/dist/typechain/vaults';
import { deployments } from 'hardhat';
import { SettlementTokenMock } from '../../typechain-types';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20';
import { rageTradeFixture } from './ragetrade-core';

export const baseVaultFixture = deployments.createFixture(async hre => {
  const { clearingHouse } = await rageTradeFixture();
  const asset = (await (await hre.ethers.getContractFactory('SettlementTokenMock')).deploy()) as SettlementTokenMock;

  const [admin, , keeper] = await hre.ethers.getSigners();

  const swapManager = await (await hre.ethers.getContractFactory('SwapManager')).deploy();
  const logic = await (
    await hre.ethers.getContractFactory('Logic', {
      libraries: {
        ['contracts/libraries/SwapManager.sol:SwapManager']: swapManager.address,
      },
    })
  ).deploy();

  const baseVaultTest = await (
    await hre.ethers.getContractFactory('BaseVaultTest', {
      libraries: {
        ['contracts/libraries/Logic.sol:Logic']: logic.address,
      },
    })
  ).deploy(asset.address, clearingHouse.address);

  await baseVaultTest.setKeeper(keeper.address);

  return { baseVaultTest, asset, admin, keeper };
});
