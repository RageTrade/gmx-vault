import { deployments } from 'hardhat';
import { rageTradeFixture } from './ragetrade-core';
import { SettlementTokenMock } from '../../typechain-types';

export const baseVaultFixture = deployments.createFixture(async hre => {
  const { clearingHouse, pool0 } = await rageTradeFixture();
  const asset = (await (await hre.ethers.getContractFactory('SettlementTokenMock')).deploy()) as SettlementTokenMock;

  const [admin, , keeper] = await hre.ethers.getSigners();

  const baseVaultTest = await (
    await hre.ethers.getContractFactory('BaseVaultTest')
  ).deploy(asset.address, clearingHouse.address, pool0.clearingHouseLens.address);

  await baseVaultTest.updateBaseParams(0, keeper.address, 86400, 0);

  return { baseVaultTest, asset, admin, keeper };
});
