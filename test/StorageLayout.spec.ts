import { expect } from 'chai';

import { getEntryFromStorage, getStorageLayout, StorageEntry, printStorage } from './utils/get-storage-layout';

interface TestCase {
  label: string;
  slot: number;
  offset?: number;
  type?: string;
  astId?: number;
}

describe('StorageLayout', () => {
  let storage: StorageEntry[];
  describe('#CurveYieldStrategy', () => {
    const sourceName = 'contracts/yieldStrategy/CurveYieldStrategy.sol';
    const contractName = 'CurveYieldStrategy';

    before(async () => {
      ({ storage } = await getStorageLayout(sourceName, contractName));
      // printStorage(storage);
    });

    runTestCases([
      { label: '_initialized', slot: 0, offset: 0, type: 't_uint8', astId: 217 },
      { label: '_initializing', slot: 0, offset: 1, type: 't_bool', astId: 220 },
      { label: '__gap', slot: 1, offset: 0, type: 't_array(t_uint256)50_storage', astId: 1461 },
      { label: '_balances', slot: 51, offset: 0, type: 't_mapping(t_address,t_uint256)', astId: 482 },
      {
        label: '_allowances',
        slot: 52,
        offset: 0,
        type: 't_mapping(t_address,t_mapping(t_address,t_uint256))',
        astId: 488,
      },
      { label: '_totalSupply', slot: 53, offset: 0, type: 't_uint256', astId: 490 },
      { label: '_name', slot: 54, offset: 0, type: 't_string_storage', astId: 492 },
      { label: '_symbol', slot: 55, offset: 0, type: 't_string_storage', astId: 494 },
      { label: '__gap', slot: 56, offset: 0, type: 't_array(t_uint256)45_storage', astId: 1073 },
      { label: 'asset', slot: 101, offset: 0, type: 't_contract(IERC20Metadata)3718', astId: 34923 },
      { label: '_owner', slot: 102, offset: 0, type: 't_address', astId: 97 },
      { label: '__gap', slot: 103, offset: 0, type: 't_array(t_uint256)49_storage', astId: 209 },
      { label: 'lens', slot: 152, offset: 0, type: 't_contract(ClearingHouseLens)8546', astId: 29283 },
      { label: 'swapSimulator', slot: 153, offset: 0, type: 't_contract(ISwapSimulator)30845', astId: 29286 },
      { label: 'rageClearingHouse', slot: 154, offset: 0, type: 't_contract(IClearingHouse)7317', astId: 29289 },
      { label: 'rageSettlementToken', slot: 155, offset: 0, type: 't_contract(IERC20Metadata)3718', astId: 29292 },
      {
        label: 'rageCollateralToken',
        slot: 156,
        offset: 0,
        type: 't_contract(ERC20PresetMinterPauser)3854',
        astId: 29295,
      },
      { label: 'ethPoolId', slot: 156, offset: 20, type: 't_uint32', astId: 29297 },
      { label: 'rageAccountNo', slot: 157, offset: 0, type: 't_uint256', astId: 29299 },
      { label: 'collateralId', slot: 158, offset: 0, type: 't_uint32', astId: 29301 },
      { label: 'rageVPool', slot: 158, offset: 4, type: 't_contract(IUniswapV3Pool)25808', astId: 29304 },
      { label: 'depositCap', slot: 159, offset: 0, type: 't_uint256', astId: 29306 },
      { label: 'lastRebalanceTS', slot: 160, offset: 0, type: 't_uint64', astId: 29308 },
      { label: 'rebalancePriceThresholdBps', slot: 160, offset: 8, type: 't_uint16', astId: 29310 },
      { label: 'rebalanceTimeThreshold', slot: 160, offset: 10, type: 't_uint32', astId: 29312 },
      { label: 'keeper', slot: 161, offset: 0, type: 't_address', astId: 29314 },
      { label: 'baseTickLower', slot: 161, offset: 20, type: 't_int24', astId: 32335 },
      { label: 'baseTickUpper', slot: 161, offset: 23, type: 't_int24', astId: 32337 },
      { label: 'baseLiquidity', slot: 162, offset: 0, type: 't_uint128', astId: 32339 },
      { label: 'isReset', slot: 162, offset: 16, type: 't_bool', astId: 32341 },
      { label: 'closePositionSlippageSqrtToleranceBps', slot: 162, offset: 17, type: 't_uint16', astId: 32343 },
      { label: 'resetPositionThresholdBps', slot: 162, offset: 19, type: 't_uint16', astId: 32345 },
      { label: 'minNotionalPositionToCloseThreshold', slot: 162, offset: 21, type: 't_uint64', astId: 32347 },
      { label: 'usdt', slot: 163, offset: 0, type: 't_contract(IERC20)3612', astId: 35437 },
      { label: 'weth', slot: 164, offset: 0, type: 't_contract(IERC20)3612', astId: 35440 },
      { label: 'usdc', slot: 165, offset: 0, type: 't_contract(IERC20)3612', astId: 35443 },
      { label: 'crvToken', slot: 166, offset: 0, type: 't_contract(IERC20)3612', astId: 35446 },
      { label: 'gauge', slot: 167, offset: 0, type: 't_contract(ICurveGauge)30934', astId: 35449 },
      { label: 'uniV3Router', slot: 168, offset: 0, type: 't_contract(ISwapRouter)29213', astId: 35452 },
      { label: 'lpPriceHolder', slot: 169, offset: 0, type: 't_contract(ILPPriceGetter)31039', astId: 35455 },
      { label: 'triCryptoPool', slot: 170, offset: 0, type: 't_contract(ICurveStableSwap)31031', astId: 35458 },
      { label: 'crvOracle', slot: 171, offset: 0, type: 't_contract(AggregatorV3Interface)45', astId: 35461 },
      { label: 'crvPendingToSwap', slot: 172, offset: 0, type: 't_uint256', astId: 35463 },
      { label: 'crvHarvestThreshold', slot: 173, offset: 0, type: 't_uint256', astId: 35465 },
      { label: 'crvSwapSlippageTolerance', slot: 174, offset: 0, type: 't_uint256', astId: 35467 },
      { label: 'stablecoinSlippageTolerance', slot: 175, offset: 0, type: 't_uint256', astId: 35469 },
      { label: 'FEE', slot: 176, offset: 0, type: 't_uint256', astId: 35475 },
    ]);
  });

  describe('#VaultPeriphery', () => {
    const sourceName = 'contracts/yieldStrategy/VaultPeriphery.sol';
    const contractName = 'VaultPeriphery';

    before(async () => {
      ({ storage } = await getStorageLayout(sourceName, contractName));
      // printStorage(storage);
    });

    runTestCases([
      { label: '_initialized', slot: 0, offset: 0, type: 't_uint8', astId: 217 },
      { label: '_initializing', slot: 0, offset: 1, type: 't_bool', astId: 220 },
      { label: '__gap', slot: 1, offset: 0, type: 't_array(t_uint256)50_storage', astId: 1461 },
      { label: '_owner', slot: 51, offset: 0, type: 't_address', astId: 97 },
      { label: '__gap', slot: 52, offset: 0, type: 't_array(t_uint256)49_storage', astId: 209 },
      { label: 'usdc', slot: 101, offset: 0, type: 't_contract(IERC20)3612', astId: 36178 },
      { label: 'usdt', slot: 102, offset: 0, type: 't_contract(IERC20)3612', astId: 36181 },
      { label: 'weth', slot: 103, offset: 0, type: 't_contract(IWETH9)30860', astId: 36184 },
      { label: 'lpToken', slot: 104, offset: 0, type: 't_contract(IERC20)3612', astId: 36187 },
      { label: 'vault', slot: 105, offset: 0, type: 't_contract(IERC4626)30821', astId: 36190 },
      { label: 'swapRouter', slot: 106, offset: 0, type: 't_contract(ISwapRouter)29213', astId: 36193 },
      { label: 'lpOracle', slot: 107, offset: 0, type: 't_contract(ILPPriceGetter)31039', astId: 36196 },
      { label: 'stableSwap', slot: 108, offset: 0, type: 't_contract(ICurveStableSwap)31031', astId: 36199 },
      { label: 'ethOracle', slot: 109, offset: 0, type: 't_contract(AggregatorV3Interface)45', astId: 36202 },
      { label: 'MAX_TOLERANCE', slot: 110, offset: 0, type: 't_uint256', astId: 36206 },
      { label: 'MAX_BPS', slot: 111, offset: 0, type: 't_uint256', astId: 36209 },
    ]);
  });

  function runTestCases(testCases: Array<TestCase>) {
    for (const { label, slot, offset, astId } of testCases) {
      it(`${label} is at ${slot}`, async () => {
        const astIdOrLabel = astId ?? label;
        const entry = getEntryFromStorage(storage, astIdOrLabel);
        expect(+entry.slot).to.eq(slot);
        expect(+entry.offset).to.eq(offset ?? 0);
      });
    }
  }
});
