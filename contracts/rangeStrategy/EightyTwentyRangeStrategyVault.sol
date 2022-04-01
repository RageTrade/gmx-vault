// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;
import { BaseVault } from '../base/BaseVault.sol';

import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { IClearingHouseStructures } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseStructures.sol';
import { IClearingHouseEnums } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseEnums.sol';

import { UniswapV3PoolHelper, IUniswapV3Pool } from '@ragetrade/core/contracts/libraries/UniswapV3PoolHelper.sol';
import { IVToken } from '@ragetrade/core/contracts/interfaces/IVToken.sol';

import { SignedFullMath } from '@ragetrade/core/contracts/libraries/SignedFullMath.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { FixedPoint96 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint96.sol';

import { SafeCast } from '../libraries/SafeCast.sol';

import { SignedMath } from '@ragetrade/core/contracts/libraries/SignedMath.sol';

import { TickMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/TickMath.sol';

import { console } from 'hardhat/console.sol';

abstract contract EightyTwentyRangeStrategyVault is BaseVault {
    using SafeCast for uint256;
    using SafeCast for uint128;
    using SafeCast for int256;
    using SignedMath for int256;
    using SignedFullMath for int256;
    using FullMath for uint256;
    using UniswapV3PoolHelper for IUniswapV3Pool;

    int24 public baseTickLower;
    int24 public baseTickUpper;
    uint128 public baseLiquidity;
    bool public isReset;
    uint16 public closePositionSlippageSqrtToleranceBps;
    uint16 public resetPositionThresholdBps;
    uint64 public minNotionalPositionToCloseThreshold;
    uint64 public constant SQRT_PRICE_FACTOR_PIPS = 800000; // scaled by 1e6

    // solhint-disable-next-line func-name-mixedcase
    function __EightyTwentyRangeStrategyVault_init(
        uint16 _closePositionSlippageSqrtToleranceBps,
        uint16 _resetPositionThresholdBps,
        uint64 _minNotionalPositionToCloseThreshold
    ) internal onlyInitializing {
        closePositionSlippageSqrtToleranceBps = _closePositionSlippageSqrtToleranceBps;
        resetPositionThresholdBps = _resetPositionThresholdBps;
        minNotionalPositionToCloseThreshold = _minNotionalPositionToCloseThreshold;
    }

    /*
        RANGE STRATEGY
    */

    function _isValidRebalanceRange() internal view override returns (bool isValid) {
        uint256 twapSqrtPriceX96 = uint256(_getTwapSqrtPriceX96());
        uint256 twapSqrtPriceX96Delta = twapSqrtPriceX96.mulDiv(rebalancePriceThresholdBps, 1e4);
        if (
            TickMath.getTickAtSqrtRatio((twapSqrtPriceX96 + twapSqrtPriceX96Delta).toUint160()) > baseTickUpper ||
            TickMath.getTickAtSqrtRatio((twapSqrtPriceX96 - twapSqrtPriceX96Delta).toUint160()) < baseTickLower
        ) isValid = true;
    }

    function _afterDepositRanges(uint256 amountAfterDeposit, uint256 amountDeposited) internal virtual override {
        int256 depositMarketValue = getMarketValue(amountDeposited).toInt256();
        _settleCollateral(depositMarketValue);
        IClearingHouseStructures.LiquidityChangeParams memory liquidityChangeParam;
        if (baseLiquidity == 0 && amountAfterDeposit == amountDeposited) {
            uint160 twapSqrtPriceX96 = _getTwapSqrtPriceX96();
            (baseTickLower, baseTickUpper, baseLiquidity) = _getUpdatedBaseRangeParams(
                twapSqrtPriceX96,
                depositMarketValue
            );
            liquidityChangeParam = _getLiquidityChangeParams(baseTickLower, baseTickUpper, baseLiquidity.toInt128());
        } else {
            // Add to base range based on the additional collateral
            liquidityChangeParam = _getLiquidityChangeParamsAfterDeposit(amountAfterDeposit, amountDeposited);
            assert(liquidityChangeParam.liquidityDelta > 0);

            baseLiquidity += uint128(liquidityChangeParam.liquidityDelta);
        }
        rageClearingHouse.updateRangeOrder(rageAccountNo, ethPoolId, liquidityChangeParam);
    }

    function _beforeWithdrawRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn) internal virtual override {
        // Remove from base range based on the collateral removal
        IClearingHouseStructures.LiquidityChangeParams
            memory liquidityChangeParam = _getLiquidityChangeParamsBeforeWithdraw(
                amountBeforeWithdraw,
                amountWithdrawn
            );
        assert(liquidityChangeParam.liquidityDelta < 0);
        baseLiquidity -= uint128(-liquidityChangeParam.liquidityDelta);
        if (baseLiquidity == 0) liquidityChangeParam.closeTokenPosition = true;
        rageClearingHouse.updateRangeOrder(rageAccountNo, ethPoolId, liquidityChangeParam);
        // Settle collateral based on updated value
        int256 depositMarketValue = getMarketValue(amountWithdrawn).toInt256();
        _settleCollateral(-depositMarketValue);
    }

    function _beforeBurnRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn)
        internal
        override
        returns (uint256 updatedAmountWithdrawn)
    {
        uint160 sqrtPriceX96 = _getTwapSqrtPriceX96();
        int256 netPosition = rageClearingHouse.getAccountNetTokenPosition(rageAccountNo, ethPoolId);
        int256 tokensToTrade = -netPosition.mulDiv(amountWithdrawn, amountBeforeWithdraw);
        uint256 tokensToTradeNotionalAbs = _getTokenNotionalAbs(netPosition, sqrtPriceX96);

        if (tokensToTradeNotionalAbs > minNotionalPositionToCloseThreshold) {
            // TODO: Remove after testing
            // console.log(amountWithdrawn);
            // console.log(amountBeforeWithdraw);
            // console.logInt(netPosition);
            // console.logInt(tokensToTrade);
            (int256 vTokenAmountOut, ) = _closeTokenPosition(
                tokensToTrade,
                sqrtPriceX96,
                closePositionSlippageSqrtToleranceBps
            );

            if (vTokenAmountOut == tokensToTrade) updatedAmountWithdrawn = amountWithdrawn;
            else {
                int256 updatedAmountWithdrawnInt = -vTokenAmountOut.mulDiv(
                    amountBeforeWithdraw.toInt256(),
                    netPosition
                );
                assert(updatedAmountWithdrawnInt > 0);
                updatedAmountWithdrawn = uint256(updatedAmountWithdrawnInt);
            }
        } else {
            updatedAmountWithdrawn = amountWithdrawn;
        }
    }

    function _rebalanceRanges(IClearingHouse.VTokenPositionView memory vTokenPosition, int256 vaultMarketValue)
        internal
        override
    {
        IClearingHouseStructures.LiquidityChangeParams[2]
            memory liquidityChangeParamList = _getLiquidityChangeParamsOnRebalance(vaultMarketValue);

        for (uint8 i = 0; i < liquidityChangeParamList.length; i++) {
            if (liquidityChangeParamList[i].liquidityDelta == 0) break;
            rageClearingHouse.updateRangeOrder(rageAccountNo, ethPoolId, liquidityChangeParamList[i]);
        }

        if (isReset) _closeTokenPosition(vTokenPosition);
    }

    function _closeTokenPosition(IClearingHouse.VTokenPositionView memory vTokenPosition) internal override {
        int256 tokensToTrade = -vTokenPosition.netTraderPosition;
        uint160 sqrtTwapPriceX96 = _getTwapSqrtPriceX96();

        (int256 vTokenAmountOut, ) = _closeTokenPosition(
            tokensToTrade,
            sqrtTwapPriceX96,
            closePositionSlippageSqrtToleranceBps
        );

        if (tokensToTrade == vTokenAmountOut) isReset = false;
    }

    function _closeTokenPosition(
        int256 tokensToTrade,
        uint160 sqrtPriceX96,
        uint16 slippageToleranceBps
    ) internal returns (int256 vTokenAmountOut, int256 vQuoteAmountOut) {
        uint160 sqrtPriceLimitX96;

        if (tokensToTrade > 0) {
            sqrtPriceLimitX96 = uint256(sqrtPriceX96).mulDiv(1e4 + slippageToleranceBps, 1e4).toUint160();
        } else {
            sqrtPriceLimitX96 = uint256(sqrtPriceX96).mulDiv(1e4 - slippageToleranceBps, 1e4).toUint160();
        }
        IClearingHouseStructures.SwapParams memory swapParams = IClearingHouseStructures.SwapParams(
            tokensToTrade,
            sqrtPriceLimitX96,
            false,
            true
        );
        (vTokenAmountOut, vQuoteAmountOut) = rageClearingHouse.swapToken(rageAccountNo, ethPoolId, swapParams);
    }

    function _getLiquidityChangeParamsOnRebalance(int256 vaultMarketValue)
        internal
        returns (IClearingHouseStructures.LiquidityChangeParams[2] memory liquidityChangeParamList)
    {
        // Get net token position
        // Remove reabalance
        // Add new rebalance range
        // Update base range liquidity
        uint8 liqCount = 0;

        if (baseLiquidity > 0) {
            assert(baseTickLower != 0);
            assert(baseTickUpper != 0);
            assert(baseLiquidity != 0);
            //Remove previous range
            liquidityChangeParamList[liqCount] = _getLiquidityChangeParams(
                baseTickLower,
                baseTickUpper,
                -baseLiquidity.toInt128()
            );
            liqCount++;
        }
        uint160 twapSqrtPriceX96 = _getTwapSqrtPriceX96();

        //TODO: should we take netPosition from outside
        int256 netPosition = rageClearingHouse.getAccountNetTokenPosition(rageAccountNo, ethPoolId);

        uint256 netPositionNotional = _getTokenNotionalAbs(netPosition, twapSqrtPriceX96);
        //To Reset if netPositionNotional > 20% of vaultMarketValue
        isReset = netPositionNotional > vaultMarketValue.absUint().mulDiv(resetPositionThresholdBps, 1e4);

        uint128 baseLiquidityUpdate;
        (baseTickLower, baseTickUpper, baseLiquidityUpdate) = _getUpdatedBaseRangeParams(
            twapSqrtPriceX96,
            vaultMarketValue
        );

        // If (there are no ranges) || (netPositionNotional > 20% of vault market value) then update base liquidity otherwise carry forward same liquidity value
        if (baseLiquidity == 0 || isReset) {
            baseLiquidity = baseLiquidityUpdate;
        }

        //Add new range
        liquidityChangeParamList[liqCount] = _getLiquidityChangeParams(
            baseTickLower,
            baseTickUpper,
            baseLiquidity.toInt128()
        );
        liqCount++;
    }

    function _getLiquidityChangeParamsAfterDeposit(uint256 amountAfterDeposit, uint256 amountDeposited)
        internal
        view
        returns (IClearingHouseStructures.LiquidityChangeParams memory liquidityChangeParam)
    {
        uint256 amountBeforeDeposit = amountAfterDeposit - amountDeposited;
        int128 liquidityDelta = baseLiquidity.toInt256().mulDiv(amountDeposited, amountBeforeDeposit).toInt128();
        liquidityChangeParam = _getLiquidityChangeParams(baseTickLower, baseTickUpper, liquidityDelta);
    }

    function _getLiquidityChangeParamsBeforeWithdraw(uint256 amountBeforeWithdraw, uint256 amountWithdrawn)
        internal
        view
        returns (IClearingHouseStructures.LiquidityChangeParams memory liquidityChangeParam)
    {
        int128 liquidityDelta = -baseLiquidity.toInt256().mulDiv(amountWithdrawn, amountBeforeWithdraw).toInt128();
        liquidityChangeParam = _getLiquidityChangeParams(baseTickLower, baseTickUpper, liquidityDelta);
    }

    function _getLiquidityChangeParams(
        int24 tickLower,
        int24 tickUpper,
        int128 liquidityDelta
    ) internal pure returns (IClearingHouseStructures.LiquidityChangeParams memory liquidityChangeParam) {
        liquidityChangeParam = IClearingHouseStructures.LiquidityChangeParams(
            tickLower,
            tickUpper,
            liquidityDelta,
            0,
            0,
            false,
            IClearingHouseEnums.LimitOrderType.NONE
        );
    }

    function _getUpdatedBaseRangeParams(uint160 sqrtPriceX96, int256 vaultMarketValue)
        internal
        pure
        returns (
            int24 baseTickLowerUpdate,
            int24 baseTickUpperUpdate,
            uint128 baseLiquidityUpdate
        )
    {
        {
            uint160 sqrtPriceLowerX96 = uint256(sqrtPriceX96).mulDiv(SQRT_PRICE_FACTOR_PIPS, 1e6).toUint160();
            uint160 sqrtPriceUpperX96 = uint256(sqrtPriceX96).mulDiv(1e6, SQRT_PRICE_FACTOR_PIPS).toUint160();

            baseTickLowerUpdate = _sqrtPriceX96ToValidTick(sqrtPriceLowerX96, false);
            baseTickUpperUpdate = _sqrtPriceX96ToValidTick(sqrtPriceUpperX96, true);
        }

        uint160 updatedSqrtPriceLowerX96 = TickMath.getSqrtRatioAtTick(baseTickLowerUpdate);

        assert(vaultMarketValue > 0);
        baseLiquidityUpdate = (
            uint256(vaultMarketValue).mulDiv(FixedPoint96.Q96 / 10, (sqrtPriceX96 - updatedSqrtPriceLowerX96))
        ).toUint128();
    }

    function _getTokenNotionalAbs(int256 tokenAmount, uint160 sqrtPriceX96)
        internal
        pure
        returns (uint256 tokenNotionalAbs)
    {
        tokenNotionalAbs = tokenAmount
            .mulDiv(sqrtPriceX96, FixedPoint96.Q96)
            .mulDiv(sqrtPriceX96, FixedPoint96.Q96)
            .absUint();
    }

    // TODO can be moved to library
    function _sqrtPriceX96ToValidTick(uint160 sqrtPriceX96, bool isTickUpper)
        internal
        pure
        returns (int24 roundedTick)
    {
        int24 tick = TickMath.getTickAtSqrtRatio(sqrtPriceX96);
        if (isTickUpper) {
            roundedTick = tick + 10 - (tick % 10);
        } else {
            roundedTick = tick - (tick % 10);
        }

        if (tick < 0) roundedTick -= 10;
    }
}
