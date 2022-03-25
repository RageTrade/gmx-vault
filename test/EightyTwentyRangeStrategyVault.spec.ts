import hre, { waffle } from 'hardhat';
import { truncate } from '@ragetrade/core/test/utils/vToken';
import { RageTradeSetup } from './setup/ragetrade';
import {
  EightyTwentyRangeStrategyVaultTest,
  ClearingHouse,
  ERC20PresetMinterPauserUpgradeable,
  SettlementTokenMock,
  OracleMock,
} from '../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';
import { parseTokenAmount } from '@ragetrade/core/test/utils/stealFunds';
import { priceToPriceX128 } from '@ragetrade/core/test/utils/price-tick';
let collateralTokenOracle: OracleMock;

const { deployContract } = waffle;

describe('EightyTwentyRangeStrategyVault', () => {
  let snapshotId: string;
  let rageTrade = new RageTradeSetup();
  let clearingHouse: ClearingHouse;
  let test: EightyTwentyRangeStrategyVaultTest;
  let collateralToken: ERC20PresetMinterPauserUpgradeable;
  let settlementToken: SettlementTokenMock;
  let yieldToken: ERC20PresetMinterPauserUpgradeable;
  let collateralTokenOracle: OracleMock;
  let vaultRageAccountNo: BigNumber;

  let signers: SignerWithAddress[];
  let admin: SignerWithAddress;
  let user0: SignerWithAddress;
  let user1: SignerWithAddress;
  let settlementTokenTreasury: SignerWithAddress;

  before(async () => {
    console.log(await hre.ethers.provider.getBlockNumber());
    // setup rage trade
    const initialPriceX128 = await priceToPriceX128(4000, 6, 18);
    await rageTrade.setup(initialPriceX128);

    // deploy EightyTwentyRangeStrategyVault
    const {
      settlementToken: _settlementToken,
      pools: [pool0],
      clearingHouse: _clearingHouse,
    } = await rageTrade.getContracts();
    settlementToken = _settlementToken;
    clearingHouse = _clearingHouse;

    const tokenFactory = await hre.ethers.getContractFactory('ERC20PresetMinterPauserUpgradeable');
    collateralToken = await tokenFactory.deploy();
    await collateralToken.initialize('Collateral Token', 'CT');
    yieldToken = await tokenFactory.deploy();
    await yieldToken.initialize('Yield Token', 'YT');

    test = await (
      await hre.ethers.getContractFactory('EightyTwentyRangeStrategyVaultTest')
    ).deploy(yieldToken.address, 'Vault Token', 'VT', truncate(pool0.vToken.address));

    signers = await hre.ethers.getSigners();

    admin = signers[0];
    user0 = signers[1];
    user1 = signers[2];
    settlementTokenTreasury = signers[3];

    const closePositionToleranceBps = 500; //5%
    const resetPositionThresholdBps = 2000; //20%
    await test.initialize(
      admin.address,
      clearingHouse.address,
      collateralToken.address,
      settlementToken.address,
      closePositionToleranceBps,
      resetPositionThresholdBps,
      1n << 128n,
      settlementTokenTreasury.address,
    );
    await test.grantAllowances();
    collateralToken.grantRole(await collateralToken.MINTER_ROLE(), test.address);
    collateralTokenOracle = await (await hre.ethers.getContractFactory('OracleMock')).deploy();

    await clearingHouse.updateCollateralSettings(collateralToken.address, {
      oracle: collateralTokenOracle.address,
      twapDuration: 300,
      isAllowedForDeposit: true,
    });

    vaultRageAccountNo = await test.rageAccountNo();
    await yieldToken.mint(user0.address, parseTokenAmount(10n ** 10n, 18));
    await yieldToken.connect(user0).approve(test.address, parseTokenAmount(10n ** 10n, 18));
    // take snapshot
    await settlementToken.mint(settlementTokenTreasury.address, parseTokenAmount(10n ** 20n, 18));
    await settlementToken.connect(settlementTokenTreasury).approve(test.address, parseTokenAmount(10n ** 20n, 18));

    snapshotId = await hre.ethers.provider.send('evm_snapshot', []);
  });
  afterEach(async () => {
    await hre.network.provider.send('evm_revert', [snapshotId]);
    snapshotId = await hre.ethers.provider.send('evm_snapshot', []);
  });

  describe('#Deposit', () => {
    it('First Deposit', async () => {
      await test.connect(user0).deposit(parseTokenAmount(10n ** 3n, 18), user0.address);

      // console.log((await clearingHouse.getAccountInfo(vaultRageAccountNo)).tokenPositions[0].liquidityPositions[0]);
      // console.log(await test.baseLiquidity());
      // console.log(await test.baseTickLower());
      // console.log(await test.totalAssets());
      // console.log(await test.totalSupply());
      // test.getLiquidityChangeParamsOnRebalance();
    });
  });

  describe.skip('#Withdraw', () => {
    before(async () => {
      await test.connect(user0).deposit(parseTokenAmount(10n ** 3n, 18), user0.address);
    });
    it('Full Withdraw - Zero Assets afterwards', async () => {
      // console.log(await clearingHouse.getAccountNetProfit(vaultRageAccountNo));
      // console.log((await clearingHouse.getAccountInfo(vaultRageAccountNo)).tokenPositions[0].liquidityPositions[0]);

      await test.connect(user0).withdraw(parseTokenAmount(10n ** 2n, 18), user0.address, user0.address);

      // console.log((await clearingHouse.getAccountInfo(vaultRageAccountNo)).tokenPositions[0].liquidityPositions[0]);
      // console.log(await test.baseLiquidity());
      // console.log(await test.baseTickLower());
      // console.log(await test.totalAssets());
      // console.log(await test.totalSupply());
    });
  });
});
