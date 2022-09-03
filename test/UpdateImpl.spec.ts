import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import addresses from '../test/fixtures/addresses';
import { increaseBlockTimestamp } from '../test/utils/vault-helpers';
import { formatEther, parseEther, parseUnits } from 'ethers/lib/utils';
import { ERC20, ICurveGauge, IGaugeFactory, ICurveStableSwap, ILPPriceGetter } from '../typechain-types';

describe('Update Implementation', () => {
  it('tests updating implementation', async () => {
    const {
      deployments: { deploy },
    } = hre;

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

    const signers = await hre.ethers.getSigners();
    const newUser = signers[0];

    const owner = '0xee2a909e3382cdf45a0d391202aff3fb11956ad1';
    const keeper = '0x0C0e6d63A7933e1C2dE16E1d5E61dB1cA802BF51';
    const oldUser = '0x507c7777837b85ede1e67f5a4554ddd7e58b1f87';
    const proxyAdmin = '0xA335Dd9CeFBa34449c0A89FB4d247f395C5e3782';
    const triCryptoWhale = '0xAc27D1D01d1C2E29c8B567860c3f38123A4A9FEA';

    const prevLogic = '0x96365da944537d027eCC9905f6b4237C093aE568';

    const vaultWithLogicAbi = await hre.ethers.getContractAt(
      'CurveYieldStrategy',
      '0x1d42783E7eeacae12EbC315D1D2D0E3C6230a068',
    );
    const vaultWithProxyAbi = await hre.ethers.getContractAt(
      'TransparentUpgradeableProxy',
      '0x1d42783E7eeacae12EbC315D1D2D0E3C6230a068',
    );

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
      params: [oldUser],
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
      from: newUser.address,
      log: true,
      waitConfirmations: undefined,
    });

    const vaultLogic = await hre.ethers.getContractAt('CurveYieldStrategy', vaultLogicDeployment.address);

    const ownerSigner = await hre.ethers.getSigner(owner);
    const keeperSigner = await hre.ethers.getSigner(keeper);
    const oldUserSigner = await hre.ethers.getSigner(oldUser);
    const proxyAdminSigner = await hre.ethers.getSigner(proxyAdmin);
    const triCryptoWhaleSigner = await hre.ethers.getSigner(triCryptoWhale);
    const vaultSigner = await hre.ethers.getSigner(vaultWithLogicAbi.address);

    const prevState = await Promise.all([
      vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.admin(),
      vaultWithLogicAbi.owner(),
      vaultWithLogicAbi.keeper(),
      vaultWithLogicAbi.name(),
      vaultWithLogicAbi.symbol(),
      vaultWithLogicAbi.asset(),
      // vaultWithLogicAbi.getVaultMarketValue(),
      vaultWithLogicAbi.getPriceX128(),
      vaultWithLogicAbi.totalSupply(),
      vaultWithLogicAbi.totalAssets(),
      vaultWithLogicAbi.getMarketValue(parseEther('1')),
      vaultWithLogicAbi.baseTickUpper(),
      vaultWithLogicAbi.baseTickLower(),
      vaultWithLogicAbi.baseLiquidity(),
      vaultWithLogicAbi.rageVPool(),
      vaultWithLogicAbi.rageAccountNo(),
      vaultWithLogicAbi.rageClearingHouse(),
      vaultWithLogicAbi.ethPoolId(),
      vaultWithLogicAbi.swapSimulator(),
      vaultWithLogicAbi.isReset(),
      vaultWithLogicAbi.isValidRebalance(await vaultWithLogicAbi.getVaultMarketValue()),
      vaultWithLogicAbi.lastRebalanceTS(),
      vaultWithLogicAbi.closePositionSlippageSqrtToleranceBps(),
      vaultWithLogicAbi.minNotionalPositionToCloseThreshold(),
      lpOracle.lp_price(),
      lpToken.balanceOf(vaultWithLogicAbi.address),
      vaultWithLogicAbi.balanceOf(oldUser),
      vaultWithLogicAbi.convertToAssets(await vaultWithLogicAbi.balanceOf(oldUser)),
    ]);

    const prevImpl = await vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation();
    const prevOldGaugeBal = await oldGauge.balanceOf(vaultWithLogicAbi.address);
    const prevNewGaugeBal = await newGauge.balanceOf(vaultWithLogicAbi.address);
    const prevOldGaugeAllowance = await lpToken.allowance(vaultWithLogicAbi.address, oldGauge.address);
    const prevNewGaugeAllowance = await lpToken.allowance(vaultWithLogicAbi.address, newGauge.address);

    await vaultWithProxyAbi.connect(proxyAdminSigner).upgradeTo(vaultLogic.address);
    await vaultWithLogicAbi.connect(ownerSigner).updateCurveParams(
      1000, // feeBps
      100, // stablecoinSlippage
      parseUnits('2', 18), // crvHarvestThreshold
      500, // crvSlippageTolerance
      addresses.NEW_GAUGE, // gauge
      '0xaebDA2c976cfd1eE1977Eac079B4382acb849325', // networkInfo.CURVE_USD_ORACLE,
    );

    await vaultWithLogicAbi.connect(ownerSigner).grantAllowances();
    await vaultWithLogicAbi.connect(ownerSigner).migrate();

    const postState = await Promise.all([
      vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.admin(),
      vaultWithLogicAbi.owner(),
      vaultWithLogicAbi.keeper(),
      vaultWithLogicAbi.name(),
      vaultWithLogicAbi.symbol(),
      vaultWithLogicAbi.asset(),
      // vaultWithLogicAbi.getVaultMarketValue(),
      vaultWithLogicAbi.getPriceX128(),
      vaultWithLogicAbi.totalSupply(),
      vaultWithLogicAbi.totalAssets(),
      vaultWithLogicAbi.getMarketValue(parseEther('1')),
      vaultWithLogicAbi.baseTickUpper(),
      vaultWithLogicAbi.baseTickLower(),
      vaultWithLogicAbi.baseLiquidity(),
      vaultWithLogicAbi.rageVPool(),
      vaultWithLogicAbi.rageAccountNo(),
      vaultWithLogicAbi.rageClearingHouse(),
      vaultWithLogicAbi.ethPoolId(),
      vaultWithLogicAbi.swapSimulator(),
      vaultWithLogicAbi.isReset(),
      vaultWithLogicAbi.isValidRebalance(await vaultWithLogicAbi.getVaultMarketValue()),
      vaultWithLogicAbi.lastRebalanceTS(),
      vaultWithLogicAbi.closePositionSlippageSqrtToleranceBps(),
      vaultWithLogicAbi.minNotionalPositionToCloseThreshold(),
      lpOracle.lp_price(),
      lpToken.balanceOf(vaultWithLogicAbi.address),
      vaultWithLogicAbi.balanceOf(oldUser),
      vaultWithLogicAbi.convertToAssets(await vaultWithLogicAbi.balanceOf(oldUser)),
    ]);

    const postImpl = await vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation();
    const postOldGaugeBal = await oldGauge.balanceOf(vaultWithLogicAbi.address);
    const postNewGaugeBal = await newGauge.balanceOf(vaultWithLogicAbi.address);
    const postOldGaugeAllowance = await lpToken.allowance(vaultWithLogicAbi.address, oldGauge.address);
    const postNewGaugeAllowance = await lpToken.allowance(vaultWithLogicAbi.address, newGauge.address);

    expect(prevState).to.deep.eq(postState);
    expect(prevImpl).to.eq(prevLogic);
    expect(postImpl).to.eq(vaultLogic.address);

    expect(prevNewGaugeBal).to.eq(0);
    expect(prevOldGaugeAllowance).to.eq(ethers.constants.MaxUint256);
    expect(prevNewGaugeAllowance).to.eq(0);

    expect(postOldGaugeBal).to.eq(0);
    expect(postNewGaugeBal).to.eq(await vaultWithLogicAbi.totalAssets());
    expect(postOldGaugeAllowance).to.eq(0);
    expect(postNewGaugeAllowance).to.eq(ethers.constants.MaxUint256);

    // old user is able to withdraw (& withdraw max)
    await vaultWithLogicAbi
      .connect(oldUserSigner)
      .redeem(await vaultWithLogicAbi.balanceOf(oldUserSigner.address), oldUserSigner.address, oldUserSigner.address);
    expect(await vaultWithLogicAbi.balanceOf(oldUser)).to.eq(0);

    // old user is able to deposit again
    await vaultWithLogicAbi.connect(oldUserSigner).deposit(parseEther('1'), oldUserSigner.address);
    expect(await vaultWithLogicAbi.balanceOf(oldUser)).to.eq(await vaultWithLogicAbi.convertToShares(parseEther('1')));

    // new user is able to deposit
    await lpToken.connect(triCryptoWhaleSigner).transfer(newUser.address, parseEther('1'));
    await lpToken.connect(newUser).approve(vaultWithLogicAbi.address, ethers.constants.MaxUint256);

    let oldTotalAssets = await vaultWithLogicAbi.totalAssets();
    let oldBalInGauge = await newGauge.balanceOf(vaultWithLogicAbi.address);
    await vaultWithLogicAbi.connect(newUser).deposit(parseEther('1'), newUser.address);
    let newTotalAssets = await vaultWithLogicAbi.totalAssets();
    let newBalInGauge = await newGauge.balanceOf(vaultWithLogicAbi.address);

    expect(newBalInGauge.sub(oldBalInGauge)).to.eq(newTotalAssets.sub(oldTotalAssets));

    // new user is able to withdraw (& withdraw max)
    oldTotalAssets = await vaultWithLogicAbi.totalAssets();
    oldBalInGauge = await newGauge.balanceOf(vaultWithLogicAbi.address);
    await vaultWithLogicAbi.connect(newUser).withdraw(parseEther('0.9'), newUser.address, newUser.address);
    newTotalAssets = await vaultWithLogicAbi.totalAssets();
    newBalInGauge = await newGauge.balanceOf(vaultWithLogicAbi.address);

    expect(oldBalInGauge.sub(newBalInGauge)).to.eq(oldTotalAssets.sub(newTotalAssets));

    await increaseBlockTimestamp(3_600 * 24);
    await vaultWithLogicAbi.connect(keeperSigner).rebalance();
    await vaultWithLogicAbi.connect(ownerSigner).withdrawFees(ownerSigner.address);

    const crvBal = await crv.balanceOf(ownerSigner.address);
    expect(crvBal).to.gt(0);

    const tx1 = vaultWithLogicAbi.connect(ownerSigner).updateBaseParams(
      parseEther('1055'),
      '0xe1829BaD81E9146E18f28E28691D930c052483bA', //networkInfo.KEEPER_ADDRESS,
      86400, // rebalanceTimeThreshold
      500, // rebalancePriceThresholdBps
    );
    await expect(tx1).to.emit(vaultWithLogicAbi, 'BaseParamsUpdated');

    const tx2 = await vaultWithLogicAbi.connect(ownerSigner).updateCurveParams(
      1000, // feeBps
      100, // stablecoinSlippage
      parseUnits('2', 18), // crvHarvestThreshold
      500, // crvSlippageTolerance
      addresses.NEW_GAUGE, // gauge
      '0xaebDA2c976cfd1eE1977Eac079B4382acb849325', // networkInfo.CURVE_USD_ORACLE,
    );
    await expect(tx2).to.emit(vaultWithLogicAbi, 'CurveParamsUpdated');

    const tx3 = vaultWithLogicAbi.connect(ownerSigner).setEightTwentyParams(150, 2000, 100e6);

    await expect(tx3).to.emit(vaultWithLogicAbi, 'EightyTwentyParamsUpdated');
  });
});
