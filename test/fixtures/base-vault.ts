import { deployments } from 'hardhat';
import { SettlementTokenMock } from '../../typechain-types';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20';
import { rageTradeFixture } from './ragetrade-core';

export const baseVaultFixture = deployments.createFixture(async hre => {
  const { clearingHouse } = await rageTradeFixture();
  const asset = (await (await hre.ethers.getContractFactory('SettlementTokenMock')).deploy()) as SettlementTokenMock;

  const baseVaultTest = await (
    await hre.ethers.getContractFactory('BaseVaultTest')
  ).deploy(asset.address, clearingHouse.address);

  const [, , keeper] = await hre.ethers.getSigners();
  await baseVaultTest.setKeeper(keeper.address);

  return { baseVaultTest, asset, keeper };
});
