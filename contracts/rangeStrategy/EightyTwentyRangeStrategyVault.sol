// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.9;

import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { IClearingHouseStructures } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseStructures.sol';
import { IClearingHouseEnums } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseEnums.sol';
import { SignedMath } from '@ragetrade/core/contracts/libraries/SignedMath.sol';
import { SignedFullMath } from '@ragetrade/core/contracts/libraries/SignedFullMath.sol';

import { ClearingHouseExtsload } from '@ragetrade/core/contracts/extsloads/ClearingHouseExtsload.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { BaseVault } from '../base/BaseVault.sol';
import { Logic } from '../libraries/Logic.sol';
import { SafeCast } from '../libraries/SafeCast.sol';

abstract contract EightyTwentyRangeStrategyVault is BaseVault {
    using SafeCast for uint256;
    using SafeCast for uint128;
    using SafeCast for int256;
    using SignedMath for int256;
    using SignedFullMath for int256;
    using FullMath for uint256;
    using ClearingHouseExtsload for IClearingHouse;

    error ETRS_INVALID_CLOSE();

    int24 public baseTickLower;
    int24 public baseTickUpper;
    uint128 public baseLiquidity;
    bool public isReset;
    uint16 public closePositionSlippageSqrtToleranceBps;
    uint16 private resetPositionThresholdBps;
    uint64 public minNotionalPositionToCloseThreshold;
    uint64 private constant SQRT_PRICE_FACTOR_PIPS = 800000; // scaled by 1e6

    struct EightyTwentyRangeStrategyVaultInitParams {
        BaseVaultInitParams baseVaultInitParams;
        uint16 closePositionSlippageSqrtToleranceBps;
        uint16 resetPositionThresholdBps;
        uint64 minNotionalPositionToCloseThreshold;
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __EightyTwentyRangeStrategyVault_init(EightyTwentyRangeStrategyVaultInitParams memory params)
        internal
        onlyInitializing
    {
        __BaseVault_init(params.baseVaultInitParams);
        closePositionSlippageSqrtToleranceBps = params.closePositionSlippageSqrtToleranceBps;
        resetPositionThresholdBps = params.resetPositionThresholdBps;
        minNotionalPositionToCloseThreshold = params.minNotionalPositionToCloseThreshold;
        emit Logic.EightyTwentyParamsUpdated(
            params.closePositionSlippageSqrtToleranceBps,
            params.resetPositionThresholdBps,
            params.minNotionalPositionToCloseThreshold
        );
    }

    function setEightTwentyParams(
        uint16 _closePositionSlippageSqrtToleranceBps,
        uint16 _resetPositionThresholdBps,
        uint64 _minNotionalPositionToCloseThreshold
    ) external onlyOwner {
        closePositionSlippageSqrtToleranceBps = _closePositionSlippageSqrtToleranceBps;
        resetPositionThresholdBps = _resetPositionThresholdBps;
        minNotionalPositionToCloseThreshold = _minNotionalPositionToCloseThreshold;
        emit Logic.EightyTwentyParamsUpdated(
            _closePositionSlippageSqrtToleranceBps,
            _resetPositionThresholdBps,
            _minNotionalPositionToCloseThreshold
        );
    }

    /*
        RANGE STRATEGY
    */

    /// @inheritdoc BaseVault
    function _isValidRebalanceRange(int256 vaultMarketValue) internal view override returns (bool isValid) {
        isValid = Logic.isValidRebalanceRangeWithoutCheckReset(
            rageVPool,
            rageClearingHouse.getTwapDuration(ethPoolId),
            rebalancePriceThresholdBps,
            baseTickLower,
            baseTickUpper
        );

        if (!isValid) {
            isValid = checkIsReset(vaultMarketValue);
        }
    }

    function checkIsReset(int256 vaultMarketValue) internal view returns (bool _isReset) {
        int256 netPosition = rageClearingHouse.getAccountNetTokenPosition(rageAccountNo, ethPoolId);

        uint256 netPositionNotional = _getTokenNotionalAbs(netPosition, _getTwapSqrtPriceX96());
        //To Reset if netPositionNotional > 20% of vaultMarketValue
        _isReset = netPositionNotional > vaultMarketValue.absUint().mulDiv(resetPositionThresholdBps, 1e4);
    }

    /// @inheritdoc BaseVault
    function _afterDepositRanges(uint256 amountAfterDeposit, uint256 amountDeposited) internal virtual override {
        int256 depositMarketValue = getMarketValue(amountDeposited).toInt256();

        // add collateral token based on updated market value - so that adding more liquidity does not cause issues
        _settleCollateral(depositMarketValue);

        IClearingHouseStructures.LiquidityChangeParams memory liquidityChangeParam;
        if (baseLiquidity == 0 && amountAfterDeposit == amountDeposited) {
            // No range present - calculate range params and add new range
            uint160 twapSqrtPriceX96 = _getTwapSqrtPriceX96();
            (baseTickLower, baseTickUpper, baseLiquidity) = Logic.getUpdatedBaseRangeParams(
                twapSqrtPriceX96,
                depositMarketValue,
                SQRT_PRICE_FACTOR_PIPS
            );
            liquidityChangeParam = _getLiquidityChangeParams(baseTickLower, baseTickUpper, baseLiquidity.toInt128());
        } else {
            // Range Present - Add to base range based on the additional assets deposited
            liquidityChangeParam = _getLiquidityChangeParamsAfterDepositWithdraw(
                amountAfterDeposit - amountDeposited,
                amountDeposited,
                false
            );
            // assert(liquidityChangeParam.liquidityDelta > 0);

            baseLiquidity += uint128(liquidityChangeParam.liquidityDelta);
        }
        //Update range on rage core
        rageClearingHouse.updateRangeOrder(rageAccountNo, ethPoolId, liquidityChangeParam);
    }

    /// @inheritdoc BaseVault
    function _beforeWithdrawRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn) internal virtual override {
        // Remove from base range based on the collateral removal
        IClearingHouseStructures.LiquidityChangeParams
            memory liquidityChangeParam = _getLiquidityChangeParamsAfterDepositWithdraw(
                amountBeforeWithdraw,
                amountWithdrawn,
                true
            );
        // assert(liquidityChangeParam.liquidityDelta < 0);
        baseLiquidity -= uint128(-liquidityChangeParam.liquidityDelta);

        //In case liquidity is becoming 0 then remove the remaining position
        //Remaining position should not lead to high slippage since threshold check is done before withdrawal
        if (baseLiquidity == 0) liquidityChangeParam.closeTokenPosition = true;
        rageClearingHouse.updateRangeOrder(rageAccountNo, ethPoolId, liquidityChangeParam);

        // Settle collateral based on updated market value of assets
        int256 depositMarketValue = getMarketValue(amountWithdrawn).toInt256();
        _settleCollateral(-depositMarketValue);
    }

    /// @inheritdoc BaseVault
    function _beforeWithdrawClosePositionRanges(int256 tokensToTrade) internal override {
        if (tokensToTrade != 0) {
            _swapToken(tokensToTrade, 0);
        }
    }

    /// @inheritdoc BaseVault
    function _rebalanceRanges(int256 netTraderPosition, int256 vaultMarketValue) internal override {
        isReset = checkIsReset(vaultMarketValue);
        IClearingHouseStructures.LiquidityChangeParams[2]
            memory liquidityChangeParamList = _getLiquidityChangeParamsOnRebalance(vaultMarketValue);

        for (uint8 i = 0; i < liquidityChangeParamList.length; i++) {
            if (liquidityChangeParamList[i].liquidityDelta == 0) break;
            rageClearingHouse.updateRangeOrder(rageAccountNo, ethPoolId, liquidityChangeParamList[i]);
        }

        if (isReset) _closeTokenPositionOnReset(netTraderPosition);
    }

    /// @inheritdoc BaseVault
    function _closeTokenPositionOnReset(int256 netTraderPosition) internal override {
        if (!isReset) revert ETRS_INVALID_CLOSE();
        int256 tokensToTrade = -netTraderPosition;
        uint160 sqrtTwapPriceX96 = _getTwapSqrtPriceX96();
        uint256 tokensToTradeNotionalAbs = _getTokenNotionalAbs(tokensToTrade, sqrtTwapPriceX96);

        if (tokensToTradeNotionalAbs > minNotionalPositionToCloseThreshold) {
            (int256 vTokenAmountOut, ) = _closeTokenPosition(
                tokensToTrade,
                sqrtTwapPriceX96,
                closePositionSlippageSqrtToleranceBps
            );

            //If whole position is closed then reset is done
            if (tokensToTrade == vTokenAmountOut) isReset = false;
        } else {
            isReset = false;
        }

        emit Logic.TokenPositionClosed();
    }

    /// @notice Close position on rage clearing house
    /// @param tokensToTrade Amount of tokens to trade
    /// @param sqrtPriceX96 Sqrt of price in X96
    /// @param slippageSqrtToleranceBps Slippage tolerance of sqrt price
    /// @return vTokenAmountOut amount of tokens on close
    /// @return vQuoteAmountOut amount of quote on close
    function _closeTokenPosition(
        int256 tokensToTrade,
        uint160 sqrtPriceX96,
        uint16 slippageSqrtToleranceBps
    ) internal returns (int256 vTokenAmountOut, int256 vQuoteAmountOut) {
        uint160 sqrtPriceLimitX96;

        if (tokensToTrade > 0) {
            sqrtPriceLimitX96 = uint256(sqrtPriceX96).mulDiv(1e4 + slippageSqrtToleranceBps, 1e4).toUint160();
        } else {
            sqrtPriceLimitX96 = uint256(sqrtPriceX96).mulDiv(1e4 - slippageSqrtToleranceBps, 1e4).toUint160();
        }
        (vTokenAmountOut, vQuoteAmountOut) = _swapToken(tokensToTrade, sqrtPriceLimitX96);
    }

    function _swapToken(int256 tokensToTrade, uint160 sqrtPriceLimitX96)
        internal
        returns (int256 vTokenAmountOut, int256 vQuoteAmountOut)
    {
        IClearingHouseStructures.SwapParams memory swapParams = IClearingHouseStructures.SwapParams({
            amount: tokensToTrade,
            sqrtPriceLimit: sqrtPriceLimitX96,
            isNotional: false,
            isPartialAllowed: true,
            settleProfit: false
        });
        (vTokenAmountOut, vQuoteAmountOut) = rageClearingHouse.swapToken(rageAccountNo, ethPoolId, swapParams);
    }

    /// @notice Get liquidity change params on rebalance
    /// @param vaultMarketValue Market value of vault in USDC
    /// @return liquidityChangeParamList Liquidity change params
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
            // assert(baseTickLower != 0);
            // assert(baseTickUpper != 0);
            // assert(baseLiquidity != 0);
            //Remove previous range
            liquidityChangeParamList[liqCount] = _getLiquidityChangeParams(
                baseTickLower,
                baseTickUpper,
                -baseLiquidity.toInt128()
            );
            liqCount++;
        }
        uint160 twapSqrtPriceX96 = _getTwapSqrtPriceX96();

        uint128 baseLiquidityUpdate;
        (baseTickLower, baseTickUpper, baseLiquidityUpdate) = Logic.getUpdatedBaseRangeParams(
            twapSqrtPriceX96,
            vaultMarketValue,
            SQRT_PRICE_FACTOR_PIPS
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

    function _simulateBeforeWithdrawRanges(uint256 assets)
        internal
        view
        override
        returns (uint256 adjustedAssets, int256 tokensToTrade)
    {
        return Logic.simulateBeforeWithdraw(address(this), totalAssets(), assets);
    }

    /// @notice Get liquidity change params on deposit
    /// @param amountBefore Amount of asset tokens after deposit
    /// @param amountDelta Amount of asset tokens deposited
    /// @param isWithdraw True if withdraw else deposit
    function _getLiquidityChangeParamsAfterDepositWithdraw(
        uint256 amountBefore,
        uint256 amountDelta,
        bool isWithdraw
    ) internal view returns (IClearingHouseStructures.LiquidityChangeParams memory liquidityChangeParam) {
        int128 liquidityDelta = baseLiquidity.toInt256().mulDiv(amountDelta, amountBefore).toInt128();
        if (isWithdraw) liquidityDelta = -liquidityDelta;
        liquidityChangeParam = _getLiquidityChangeParams(baseTickLower, baseTickUpper, liquidityDelta);
    }

    /// @notice Get liquidity change params struct
    /// @param tickLower Lower tick of range
    /// @param tickUpper Upper tick of range
    /// @param liquidityDelta Liquidity delta of range
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
            IClearingHouseEnums.LimitOrderType.NONE,
            false
        );
    }
}
