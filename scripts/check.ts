import { CurveYieldStrategy__factory, vaults } from '@ragetrade/sdk';
import { formatEther, parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { ethers } from 'hardhat';
import { waitConfirmations } from '../deploy/network-info';
import addresses from '../test/fixtures/addresses';
import { increaseBlockTimestamp } from '../test/utils/vault-helpers';
import { ERC20, ICurveGauge, IGaugeFactory, ICurveStableSwap, ILPPriceGetter } from '../typechain-types';
import {wrapHardhatProvider} from 'hardhat-tracer'

async function main() {

  // await wrapHardhatProvider(hre)
  // hre.tracer.enabled = true

  const { deployments: { deploy } } = hre;

  /**
   * - impersonate owner
   * - deploy libs
   * - link libs
   * - deploy impl
   * - upgrade impl
   * - call updateCurveParams
   * - call grantAllowances
   * - call migrate
   */

  const crv = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.CRV,
  )) as ERC20;

  const oldGauge = (await hre.ethers.getContractAt(
    'contracts/interfaces/curve/ICurveGauge.sol:ICurveGauge',
    addresses.OLD_GAUGE,
  )) as ICurveGauge;

  const newGauge = (await hre.ethers.getContractAt(
    'contracts/interfaces/curve/ICurveGauge.sol:ICurveGauge',
    addresses.NEW_GAUGE,
  )) as ICurveGauge;

  const gaugeFactory = (await hre.ethers.getContractAt(
    'contracts/interfaces/curve/IGaugeFactory.sol:IGaugeFactory',
    addresses.GAUGE_FACTORY,
  )) as IGaugeFactory;

  const lpToken = (await hre.ethers.getContractAt(
    '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
    addresses.TRICRYPTO_LP_TOKEN,
  )) as ERC20;

  const lpOracle = (await hre.ethers.getContractAt(
    'contracts/interfaces/curve/ILPPriceGetter.sol:ILPPriceGetter',
    addresses.QUOTER,
  )) as ILPPriceGetter;

  const signers = await hre.ethers.getSigners()
  const signer = signers[0]

  const owner = '0xee2a909e3382cdf45a0d391202aff3fb11956ad1';
  const keeper = '0x0C0e6d63A7933e1C2dE16E1d5E61dB1cA802BF51'
  const proxyAdmin = '0xA335Dd9CeFBa34449c0A89FB4d247f395C5e3782'
  const triCryptoWhale = '0xAc27D1D01d1C2E29c8B567860c3f38123A4A9FEA'

  const ownerSigner = await hre.ethers.getSigner(owner);
  const keeperSigner = await hre.ethers.getSigner(keeper);
  const proxyAdminSigner = await hre.ethers.getSigner(proxyAdmin);

  const vaultWithLogicAbi = await hre.ethers.getContractAt('CurveYieldStrategy', '0x1d42783E7eeacae12EbC315D1D2D0E3C6230a068')
  const vaultWithProxyAbi = await hre.ethers.getContractAt('TransparentUpgradeableProxy', '0x1d42783E7eeacae12EbC315D1D2D0E3C6230a068')

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [owner],
  });

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [keeper],
  });

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [proxyAdmin],
  });

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [vaultWithLogicAbi.address],
  });

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [triCryptoWhale],
  });

  const tcwSigner = await hre.ethers.getSigner(triCryptoWhale)
  const vaultSigner = await hre.ethers.getSigner(vaultWithLogicAbi.address)

  // console.log("===BEFORE===")
  // console.log("OLD GAUGE: balanceOf vault", await oldGauge.balanceOf(vaultWithLogicAbi.address))
  // console.log("OLD GAUGE: tricrypto balanceOf vault", await lpToken.balanceOf(vaultWithLogicAbi.address))

  // console.log("NEW GAUGE: balanceOf vault", await newGauge.balanceOf(vaultWithLogicAbi.address))
  // console.log("NEW GAUGE: tricrypto balanceOf vault", await lpToken.balanceOf(vaultWithLogicAbi.address))

  const swapManager = await (await hre.ethers.getContractFactory('SwapManager')).deploy();
  const logic = await (
    await hre.ethers.getContractFactory('Logic', {
      libraries: {
        ['contracts/libraries/SwapManager.sol:SwapManager']: swapManager.address,
      },
    })
  ).deploy();

  const vaultLogicDeployment = await deploy('CurveYieldStrategyLogic', {
    contract: 'CurveYieldStrategy',
    libraries: {
      SwapManager: swapManager.address,
      Logic: logic.address,
    },
    from: signer.address,
    log: true,
    waitConfirmations: undefined
  });

  const vaultLogic = await hre.ethers.getContractAt('CurveYieldStrategy', vaultLogicDeployment.address);

  await vaultWithProxyAbi.connect(proxyAdminSigner).upgradeTo(vaultLogic.address)
  await vaultWithLogicAbi.connect(ownerSigner).updateCurveParams(
    1000, // feeBps
    100, // stablecoinSlippage
    parseUnits('2', 18), // crvHarvestThreshold
    500, // crvSlippageTolerance
    addresses.NEW_GAUGE,
    '0xaebDA2c976cfd1eE1977Eac079B4382acb849325', // networkInfo.CURVE_USD_ORACLE,
  )

  await vaultWithLogicAbi.connect(ownerSigner).grantAllowances();

  await vaultWithLogicAbi.connect(ownerSigner).migrate()

  // console.log("===AFTER===")
  // console.log("OLD GAUGE: balanceOf vault", await oldGauge.balanceOf(vaultWithLogicAbi.address))
  // console.log("OLD GAUGE: tricrypto balanceOf vault", await lpToken.balanceOf(vaultWithLogicAbi.address))

  // console.log("NEW GAUGE: balanceOf vault", await newGauge.balanceOf(vaultWithLogicAbi.address))
  // console.log("NEW GAUGE: tricrypto balanceOf vault", await lpToken.balanceOf(vaultWithLogicAbi.address))

  // console.log('===========================')
  // console.log("CRV BAL BEFORE MINT", await crv.balanceOf(vaultWithLogicAbi.address))
  // await gaugeFactory.connect(vaultSigner).mint(newGauge.address)
  // console.log("INITIAL CRV REWARDS", await newGauge.claimable_reward(vaultWithLogicAbi.address, crv.address))
  // console.log("INITIAL CRV BALANCE", await crv.balanceOf(vaultWithLogicAbi.address))

  await lpToken.connect(tcwSigner).approve(vaultWithLogicAbi.address, ethers.constants.MaxUint256)
  await increaseBlockTimestamp(3600)
  // console.log("CRV BAL BEFORE MINT", await crv.balanceOf(vaultWithLogicAbi.address))
  // await gaugeFactory.connect(vaultSigner).mint(newGauge.address)
  // console.log("REWARDS AFTER SOMETIME", await newGauge.claimable_reward(vaultWithLogicAbi.address, crv.address))
  // console.log("CRV BALANCE AFTER SOMETIME", formatEther(await crv.balanceOf(vaultWithLogicAbi.address)))

   /**
    * CRV to mint < 2 CRV, so don't swap
    */
  console.log('CASE WHERE CRV < threshold')

   let vaultPrevBal = await crv.balanceOf(vaultWithLogicAbi.address)
   await vaultWithLogicAbi.connect(tcwSigner).deposit(parseEther('0.1'), triCryptoWhale)
   let vaultNewBal = await crv.balanceOf(vaultWithLogicAbi.address)

   console.log('vaultPrevBal', formatEther(vaultPrevBal));
   console.log('vaultNewBal', formatEther((vaultNewBal)));
   console.log('tricrypto', formatEther((await newGauge.balanceOf(vaultWithLogicAbi.address))))
   console.log('price of tricrypto', formatEther(await lpOracle.lp_price()))

   console.log('CASE WHERE CRV > threshold')
   await increaseBlockTimestamp(3600)

   vaultPrevBal = await crv.balanceOf(vaultWithLogicAbi.address)
   await vaultWithLogicAbi.connect(tcwSigner).deposit(parseEther('0.1'), triCryptoWhale)
   vaultNewBal = await crv.balanceOf(vaultWithLogicAbi.address)

   console.log('vaultPrevBal', formatEther(vaultPrevBal));
   console.log('vaultNewBal', formatEther((vaultNewBal)));
   console.log('tricrypto', formatEther((await newGauge.balanceOf(vaultWithLogicAbi.address))))
   console.log('price of tricrypto', formatEther(await lpOracle.lp_price()))

   console.log('==WITHDRAW==')
   await vaultWithLogicAbi.connect(tcwSigner).deposit(await vaultWithLogicAbi.maxWithdraw(tcwSigner.address), triCryptoWhale)

   await increaseBlockTimestamp(3600 * 24)
   console.log('===REBALANCE===')
   await vaultWithLogicAbi.connect(keeperSigner).rebalance()
   console.log('DONE')

   console.log('gexPriceX128', await vaultWithLogicAbi.getPriceX128())
   console.log('getVaultMarketValue', await vaultWithLogicAbi.getVaultMarketValue())
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

