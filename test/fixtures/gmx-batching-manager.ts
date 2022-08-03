import { deployments } from 'hardhat';
import { ERC20 } from '../../typechain-types';
import { getCreateAddressFor, parseTokenAmount } from '@ragetrade/sdk';
import addresses, { GMX_ECOSYSTEM_ADDRESSES as gmxAddresses } from './addresses';

export const gmxBatchingManagerFixture = deployments.createFixture(async hre => {
  const [admin, keeper, user1, user2] = await hre.ethers.getSigners();

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [gmxAddresses.USDC_WHALE],
  });

  const usdcWhale = await hre.ethers.getSigner(gmxAddresses.USDC_WHALE);
  const gmxBatchingManagerAddress = await getCreateAddressFor(admin, 2);

  const stakingManager = await (
    await hre.ethers.getContractFactory('GmxVaultMock')
  ).deploy(gmxBatchingManagerAddress, gmxAddresses.StakedGlp);

  const vault = await (
    await hre.ethers.getContractFactory('GmxVaultMock')
  ).deploy(gmxBatchingManagerAddress, gmxAddresses.StakedGlp);

  const gmxBatchingManagerFactory = await hre.ethers.getContractFactory('GMXBatchingManager');

  const gmxBatchingManager = await gmxBatchingManagerFactory.deploy();

  await gmxBatchingManager.initialize(
    gmxAddresses.StakedGlp,
    gmxAddresses.RewardRouter,
    gmxAddresses.GlpManager,
    stakingManager.address,
    keeper.address,
  );
  await vault.grantAllowances();
  await stakingManager.grantAllowances();
  await gmxBatchingManager.addVault(vault.address);
  await gmxBatchingManager.grantAllowances(vault.address);

  const usdc = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.USDC,
  )) as ERC20;

  const fsGlp = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    gmxAddresses.fsGLP,
  )) as ERC20;

  const sGlp = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    gmxAddresses.StakedGlp,
  )) as ERC20;

  await usdc.connect(usdcWhale).transfer(user1.address, parseTokenAmount(1000, 6));
  await usdc.connect(usdcWhale).transfer(user2.address, parseTokenAmount(1000, 6));
  await usdc.connect(usdcWhale).transfer(vault.address, parseTokenAmount(1000, 6));
  await usdc.connect(usdcWhale).transfer(stakingManager.address, parseTokenAmount(1000, 6));

  await usdc.connect(user1).approve(gmxBatchingManager.address, 2n ** 255n);
  await usdc.connect(user2).approve(gmxBatchingManager.address, 2n ** 255n);

  return {
    admin,
    usdc,
    sGlp,
    fsGlp,
    vault,
    stakingManager,
    keeper,
    usdcWhale,
    user1,
    user2,
    gmxBatchingManager,
  };
});
