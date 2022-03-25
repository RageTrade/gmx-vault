import hre, { deployments } from 'hardhat';
import { CurveYieldStrategyTest } from '../typechain-types';
import { curveYieldStrategyFixture } from './fixtures/curve-yield-strategy';

describe('CurveYieldStrategy', () => {
  beforeEach(async () => {
    // deploys contracts once
    await curveYieldStrategyFixture();
  });

  describe('#deposit', () => {
    it('should perform approvals', async () => {
      const { curveYieldStrategyTest } = await curveYieldStrategyFixture();
      curveYieldStrategyTest.grantAllowances();
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
