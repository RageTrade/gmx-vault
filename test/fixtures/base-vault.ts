import { deployments } from 'hardhat';
import { SettlementTokenMock } from '../../typechain-types';
import { ERC20 } from '../../typechain-types/artifacts/@openzeppelin/contracts/token/ERC20';
import { rageTradeFixture } from './ragetrade-core';

export const baseVaultFixture = deployments.createFixture(async hre => {
  const { clearingHouse, pool0 } = await rageTradeFixture();
  const asset = (await (await hre.ethers.getContractFactory('SettlementTokenMock')).deploy()) as SettlementTokenMock;

  const baseVaultTest = await (
    await hre.ethers.getContractFactory('BaseVaultTest')
  ).deploy(asset.address, clearingHouse.address, pool0.clearingHouseLens.address);

  await baseVaultTest.updateBaseParams(0, keeper.address, 86400, 0);

  return { baseVaultTest, asset, admin, keeper };
});
