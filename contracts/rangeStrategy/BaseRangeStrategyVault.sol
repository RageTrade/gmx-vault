// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { IClearingHouseEnums } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseEnums.sol';
import { IClearingHouseStructures } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseStructures.sol';
import { IVToken } from '@ragetrade/core/contracts/interfaces/IVToken.sol';
import { SignedFullMath } from '@ragetrade/core/contracts/libraries/SignedFullMath.sol';
import { SignedMath } from '@ragetrade/core/contracts/libraries/SignedMath.sol';
import { UniswapV3PoolHelper } from '@ragetrade/core/contracts/libraries/UniswapV3PoolHelper.sol';

import { FixedPoint96 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint96.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { TickMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/TickMath.sol';
import { IUniswapV3Pool } from '@uniswap/v3-core-0.8-support/contracts/interfaces/IUniswapV3Pool.sol';

import { BaseVault } from '../base/BaseVault.sol';
import { SafeCast } from '../libraries/SafeCast.sol';

abstract contract BaseRangeStrategyVault is BaseVault {
    using SafeCast for uint256;
    using SafeCast for uint128;
    using SafeCast for int256;
    using SignedMath for int256;
    using SignedFullMath for int256;
    using FullMath for uint256;
    using UniswapV3PoolHelper for IUniswapV3Pool;

    /*
        RANGE STRATEGY
    */
    function _afterDepositRanges(uint256, uint256 amountDeposited) internal override {
        int256 depositMarketValue = getMarketValue(amountDeposited).toInt256();
        _settleCollateral(depositMarketValue);

        // Add to base range based on the additional collateral
        // IClearingHouse.LiquidityChangeParams memory liquidityChangeParam = _getLiquidityChangeParamsAfterDeposit(amountAfterDeposit, amountDeposited);

        // assert(liquidityChangeParam.liquidityDelta>0);

        // rageClearingHouse.updateRangeOrder(rageAccountNo, ethPoolId, liquidityChangeParam);
        // baseLiquidity += uint128(liquidityChangeParam.liquidityDelta);
    }

    function _beforeWithdrawRanges(uint256, uint256 amountWithdrawn) internal override {
        // Remove from base range based on the collateral removal
        // IClearingHouse.LiquidityChangeParams memory liquidityChangeParam =  _getLiquidityChangeParamsBeforeWithdraw(amountBeforeWithdraw, amountWithdrawn);
        // assert(liquidityChangeParam.liquidityDelta<0);

        // baseLiquidity -= uint128(-liquidityChangeParam.liquidityDelta);
        // rageClearingHouse.updateRangeOrder(rageAccountNo, ethPoolId, liquidityChangeParam);
        // Settle collateral based on updated value
        int256 depositMarketValue = getMarketValue(amountWithdrawn).toInt256();
        _settleCollateral(-depositMarketValue);
    }

    function _rebalanceRanges(
        IClearingHouse.VTokenPositionView memory vTokenPosition,
        IClearingHouse.Pool memory rageTradePool,
        int256 vaultMarketValue
    ) internal override {
        IClearingHouse.LiquidityChangeParams[4] memory liquidityChangeParamList = getLiquidityChangeParams(
            vTokenPosition,
            rageTradePool,
            vaultMarketValue
        );

        for (uint8 i = 0; i < liquidityChangeParamList.length; i++) {
            if (liquidityChangeParamList[i].liquidityDelta == 0) break;
            rageClearingHouse.updateRangeOrder(rageAccountNo, ethPoolId, liquidityChangeParamList[i]);
        }
    }

    function _closeTokenPosition(
        IClearingHouse.VTokenPositionView memory vTokenPosition,
        IClearingHouse.Pool memory rageTradePool
    ) internal override {
        // solhint-disable-previous-line no-empty-blocks
        //Do Nothing
    }

    function getLiquidityChangeParams(
        IClearingHouse.VTokenPositionView memory vTokenPosition,
        IClearingHouse.Pool memory rageTradePool,
        int256 vaultMarketValue
    ) internal view returns (IClearingHouseStructures.LiquidityChangeParams[4] memory liquidityChangeParamList) {
        // Get net token position
        // Remove reabalance
        // Add new rebalance range
        // Update base range liquidity
        int256 netPosition = rageClearingHouse.getAccountNetTokenPosition(rageAccountNo, ethPoolId);
        uint160 twapSqrtPriceX96 = rageTradePool.vPool.twapSqrtPrice(rageTradePool.settings.twapDuration);

        uint8 liqCount = 0;
        if (netPosition != 0) {
            // Rebalance Range
            uint160 sqrtPriceLowerX96;
            uint160 sqrtPriceUpperX96;
            int128 liquidityDelta;
            if (netPosition > 0) {
                sqrtPriceLowerX96 = twapSqrtPriceX96;
                sqrtPriceUpperX96 = uint256(twapSqrtPriceX96).mulDiv(104880885, 1e8).toUint160(); //multiplication by sqrt(1.1)

                // liquidityDelta = netTokenPositionAccrued * sqrtPCurrent * (sqrt(1+r) +1+r)/r
                // for r=.1 -> (sqrt(1+r) +1+r)/r = 21.48808848
                liquidityDelta = netPosition
                    .mulDiv(int256(2148808848), 1e8)
                    .mulDiv(twapSqrtPriceX96, FixedPoint96.Q96)
                    .toInt128();
            } else {
                sqrtPriceLowerX96 = uint256(twapSqrtPriceX96).mulDiv(94868330, 1e8).toUint160(); //multiplication by sqrt(.9)
                sqrtPriceUpperX96 = twapSqrtPriceX96;

                // liquidityDelta = -netTokenPositionAccrued * sqrtPCurrent * (sqrt(1-r) +1-r)/r
                // for r=.1 -> (sqrt(1-r) +1-r)/r = 18.48683298
                liquidityDelta = netPosition
                    .mulDiv(int256(1848683298), 1e8)
                    .mulDiv(twapSqrtPriceX96, FixedPoint96.Q96)
                    .toInt128();
            }

            liquidityChangeParamList[liqCount] = IClearingHouseStructures.LiquidityChangeParams(
                TickMath.getTickAtSqrtRatio(sqrtPriceLowerX96),
                TickMath.getTickAtSqrtRatio(sqrtPriceUpperX96),
                liquidityDelta,
                0,
                0,
                false,
                IClearingHouseEnums.LimitOrderType.NONE
            );
            liqCount++;
        }

        {
            // Base Range

            // LiquidityDelta = (vaultMarketValue / (sqrtPCurrent * MMargin) - abs(netTokenPositionAccrued)* sqrtPCurrent)* (sqrt(1-b) +1-b)/b
            // for b=0.4 (sqrt(1-b) +1-b)/b=

            int128 liquidityDelta;
            {
                int256 liquidityDeltaTerm1 = vaultMarketValue.mulDiv(FixedPoint96.Q96, twapSqrtPriceX96).mulDiv(
                    1e4,
                    rageTradePool.settings.maintainanceMarginRatioBps
                );
                int256 liquidityDeltaTerm2 = netPosition.abs().mulDiv(twapSqrtPriceX96, FixedPoint96.Q96); //multiplication by (sqrt(1-b) +1-b)/b

                liquidityDelta = (liquidityDeltaTerm1 - liquidityDeltaTerm2).mulDiv(int256(343649167), 1e8).toInt128();
            }

            uint160 sqrtPriceLowerX96 = uint256(twapSqrtPriceX96).mulDiv(77459667, 1e8).toUint160(); //multiplication by sqrt(0.6)
            uint160 sqrtPriceUpperX96 = uint256(twapSqrtPriceX96).mulDiv(118321596, 1e8).toUint160(); //multiplication by sqrt(1.4)

            {
                int24 tickLower = TickMath.getTickAtSqrtRatio(sqrtPriceLowerX96);
                int24 tickUpper = TickMath.getTickAtSqrtRatio(sqrtPriceUpperX96);

                tickLower += (10 - (tickLower % 10));
                tickUpper -= tickUpper % 10;

                liquidityChangeParamList[liqCount] = IClearingHouseStructures.LiquidityChangeParams(
                    tickLower,
                    tickUpper,
                    liquidityDelta,
                    0,
                    0,
                    false,
                    IClearingHouseEnums.LimitOrderType.NONE
                );
            }
            liqCount++;
        }
        {
            // Remove previous ranges
            IClearingHouse.LiquidityPositionView[] memory liquidityPositions = vTokenPosition.liquidityPositions;
            for (uint8 i = 0; i < liquidityPositions.length; ++i) {
                assert(liquidityPositions[i].tickLower != 0);
                assert(liquidityPositions[i].tickUpper != 0);
                assert(liquidityPositions[i].liquidity != 0);

                liquidityChangeParamList[liqCount] = IClearingHouseStructures.LiquidityChangeParams(
                    liquidityPositions[i].tickLower,
                    liquidityPositions[i].tickUpper,
                    -(liquidityPositions[i].liquidity.toInt128()),
                    0,
                    0,
                    false,
                    IClearingHouseEnums.LimitOrderType.NONE
                );
                liqCount++;
            }
        }
    }

    function _isValidRebalanceRange(IClearingHouse.Pool memory) internal pure override returns (bool isValid) {
        isValid = true;
    }
}
