import { deployments } from 'hardhat';
import { ERC20 } from '../../typechain-types';
import { getCreateAddressFor, parseTokenAmount } from '@ragetrade/sdk';
import addresses, { GMX_ECOSYSTEM_ADDRESSES as gmxAddresses } from './addresses';
import { generateErc20Balance } from '../utils/erc20';

export const gmxBatchingManagerFixture = deployments.createFixture(async hre => {
  const [admin, keeper, user1, user2] = await hre.ethers.getSigners();

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [gmxAddresses.USDC_WHALE],
  });

  const usdcWhale = await hre.ethers.getSigner(gmxAddresses.USDC_WHALE);
  const gmxBatchingManagerAddress = await getCreateAddressFor(admin, 1);

  const stakingManager = await (
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

  const vault = await (
    await hre.ethers.getContractFactory('GmxVaultMock')
  ).deploy(gmxBatchingManagerAddress, gmxAddresses.StakedGlp);

  const vault1 = await (
    await hre.ethers.getContractFactory('GmxVaultMock')
  ).deploy(gmxBatchingManagerAddress, gmxAddresses.StakedGlp);

  await vault.grantAllowances();
  await vault1.grantAllowances();
  await stakingManager.grantAllowances();
  await gmxBatchingManager.addVault(vault.address);
  await gmxBatchingManager.grantAllowances(vault.address);
  await gmxBatchingManager.addVault(vault1.address);
  await gmxBatchingManager.grantAllowances(vault1.address);

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

  await usdc.connect(user1).approve(gmxBatchingManager.address, 2n ** 255n);
  await usdc.connect(user2).approve(gmxBatchingManager.address, 2n ** 255n);

  await generateErc20Balance(usdc, parseTokenAmount(1000, 6), user1.address);
  await generateErc20Balance(usdc, parseTokenAmount(1000, 6), user2.address);
  await generateErc20Balance(usdc, parseTokenAmount(1000, 6), vault.address);
  await generateErc20Balance(usdc, parseTokenAmount(1000, 6), vault1.address);
  await generateErc20Balance(usdc, parseTokenAmount(1000, 6), stakingManager.address);

  return {
    admin,
    usdc,
    sGlp,
    fsGlp,
    vault,
    vault1,
    stakingManager,
    keeper,
    usdcWhale,
    user1,
    user2,
    gmxBatchingManager,
  };
});
