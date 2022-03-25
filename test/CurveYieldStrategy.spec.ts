import hre, { deployments } from 'hardhat';
import { CurveYieldStrategyTest } from '../typechain-types';
import { setupCurveYieldStrategy } from './fixtures/curve-yield-strategy';

describe('CurveYieldStrategy', () => {
  let curveYieldStrategyTest: CurveYieldStrategyTest;

  beforeEach(async () => {
    ({ curveYieldStrategyTest } = await setupCurveYieldStrategy());
    const [signer] = await hre.ethers.getSigners();
    // test.initialize(signer.address);
  });

  // beforeEach(async () => {});

  describe('#deposit', () => {
    it('should perform approvals', async () => {
      // grantAllowances
      // const val = await curveYieldStrategyTest.FEE();
      // console.log(val);
    });
    it('should transfer tokens', async () => {
      // console.log(1);
    });
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
