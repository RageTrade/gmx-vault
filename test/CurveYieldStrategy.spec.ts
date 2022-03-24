import hre, { deployments } from 'hardhat';
import { CurveYieldStrategyTest } from '../typechain-types';
import { RageTradeSetup } from './setup/ragetrade';

const setupRageTrade = deployments.createFixture(async hre => {
  await deployments.fixture('RageTradeFactory');
  await (await hre.ethers.getContractFactory('CurveYieldStrategyTest')).deploy();
  return {};
});

describe('CurveYieldStrategy', () => {
  const rageTrade = new RageTradeSetup();
  let test: CurveYieldStrategyTest;

  before(async () => {
    await setupRageTrade();
    test = await (await hre.ethers.getContractFactory('CurveYieldStrategyTest')).deploy();
    const [signer] = await hre.ethers.getSigners();
    // test.initialize(signer.address);
  });

  beforeEach(async () => {});

  describe('#deposit', () => {
    it('should perform approvals', async () => {
      // grantAllowances
    });
    it('should transfer tokens');
    it('should add liquidity');
  });

  describe('#internal', () => {
    it('should deposit usdc');
    it('should withdraw usdc');
  });

  describe('#withdraw', () => {
    it('should pull LP from pool');
    it('should claim fees from LP');
    it('should deduct rage fee (10% which can be changed)');
    it('should transfer to user');
  });

  describe('#lpPrice', () => {
    it('should calculate TVL of vault');
  });

  describe('#fee', () => {
    it('should handle fee changes');
  });
});
