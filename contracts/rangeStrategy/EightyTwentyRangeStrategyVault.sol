// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;
import { BaseVault } from '../base/BaseVault.sol';

import { IVToken } from '@ragetrade/core/contracts/interfaces/IVToken.sol';
import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { IClearingHouseStructures } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseStructures.sol';
import { IClearingHouseEnums } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseEnums.sol';

import { UniswapV3PoolHelper, IUniswapV3Pool } from '@ragetrade/core/contracts/libraries/UniswapV3PoolHelper.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { SignedMath } from '@ragetrade/core/contracts/libraries/SignedMath.sol';
import { SignedFullMath } from '@ragetrade/core/contracts/libraries/SignedFullMath.sol';

import { SafeCast } from '../libraries/SafeCast.sol';
import { FixedPoint96 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint96.sol';

import { Logic } from '../libraries/Logic.sol';

abstract contract EightyTwentyRangeStrategyVault is BaseVault {
    using SafeCast for uint256;
    using SafeCast for uint128;
    using SafeCast for int256;
    using SignedMath for int256;
    using SignedFullMath for int256;
    using FullMath for uint256;
    using UniswapV3PoolHelper for IUniswapV3Pool;

    error ETRS_INVALID_CLOSE();

    int24 public baseTickLower;
    int24 public baseTickUpper;
    uint128 public baseLiquidity;
    bool public isReset;
    uint16 private closePositionSlippageSqrtToleranceBps;
    uint16 private resetPositionThresholdBps;
    uint64 private minNotionalPositionToCloseThreshold;
    uint64 private constant SQRT_PRICE_FACTOR_PIPS = 800000; // scaled by 1e6

    struct EightyTwentyRangeStrategyVaultInitParams {
        BaseVaultInitParams baseVaultInitParams;
        uint16 closePositionSlippageSqrtToleranceBps;
        uint16 resetPositionThresholdBps;
        uint64 minNotionalPositionToCloseThreshold;
    }

    // solhint-disable-next-line func-name-mixedcase
    function __EightyTwentyRangeStrategyVault_init(EightyTwentyRangeStrategyVaultInitParams memory params)
        internal
        onlyInitializing
    {
        __BaseVault_init(params.baseVaultInitParams);
        closePositionSlippageSqrtToleranceBps = params.closePositionSlippageSqrtToleranceBps;
        resetPositionThresholdBps = params.resetPositionThresholdBps;
        minNotionalPositionToCloseThreshold = params.minNotionalPositionToCloseThreshold;
    }

    function setEightTwentyParams(
        uint16 _closePositionSlippageSqrtToleranceBps,
        uint16 _resetPositionThresholdBps,
        uint64 _minNotionalPositionToCloseThreshold
    ) external onlyOwner {
        closePositionSlippageSqrtToleranceBps = _closePositionSlippageSqrtToleranceBps;
        resetPositionThresholdBps = _resetPositionThresholdBps;
        minNotionalPositionToCloseThreshold = _minNotionalPositionToCloseThreshold;
    }

    /*
        RANGE STRATEGY
    */

    /// @inheritdoc BaseVault
    function _isValidRebalanceRange(int256 vaultMarketValue) internal view override returns (bool isValid) {
        isValid = Logic.isValidRebalanceRangeWithoutCheckReset(
            rageVPool,
            rageTwapDuration,
            rebalancePriceThresholdBps,
            baseTickLower,
            baseTickUpper
        );

        if (!isValid) {
            isValid = checkIsReset(vaultMarketValue);
        }
    }

    function checkIsReset(int256 vaultMarketValue) internal view returns (bool _isReset) {
        //TODO: should we take netPosition from outside
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
            liquidityChangeParam = _getLiquidityChangeParamsAfterDeposit(amountAfterDeposit, amountDeposited);
            assert(liquidityChangeParam.liquidityDelta > 0);

            baseLiquidity += uint128(liquidityChangeParam.liquidityDelta);
        }
        //Update range on rage core
        rageClearingHouse.updateRangeOrder(rageAccountNo, ethPoolId, liquidityChangeParam);
    }

    /// @inheritdoc BaseVault
    function _beforeWithdrawRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn) internal virtual override {
        // Remove from base range based on the collateral removal
        IClearingHouseStructures.LiquidityChangeParams
            memory liquidityChangeParam = _getLiquidityChangeParamsBeforeWithdraw(
                amountBeforeWithdraw,
                amountWithdrawn
            );
        assert(liquidityChangeParam.liquidityDelta < 0);
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
    function _beforeWithdrawClosePositionRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn)
        internal
        override
        returns (uint256 updatedAmountWithdrawn)
    {
        uint160 sqrtPriceX96 = _getTwapSqrtPriceX96();
        int256 netPosition = rageClearingHouse.getAccountNetTokenPosition(rageAccountNo, ethPoolId);
        int256 tokensToTrade = -netPosition.mulDiv(amountWithdrawn, amountBeforeWithdraw);
        uint256 tokensToTradeNotionalAbs = _getTokenNotionalAbs(netPosition, sqrtPriceX96);

        if (tokensToTradeNotionalAbs > minNotionalPositionToCloseThreshold) {
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

    /// @inheritdoc BaseVault
    function _rebalanceRanges(IClearingHouse.VTokenPositionView memory vTokenPosition, int256 vaultMarketValue)
        internal
        override
    {
        isReset = checkIsReset(vaultMarketValue);
        IClearingHouseStructures.LiquidityChangeParams[2]
            memory liquidityChangeParamList = _getLiquidityChangeParamsOnRebalance(vaultMarketValue);

        for (uint8 i = 0; i < liquidityChangeParamList.length; i++) {
            if (liquidityChangeParamList[i].liquidityDelta == 0) break;
            rageClearingHouse.updateRangeOrder(rageAccountNo, ethPoolId, liquidityChangeParamList[i]);
        }

        if (isReset) _closeTokenPositionOnReset(vTokenPosition);
    }

    /// @inheritdoc BaseVault
    function _closeTokenPositionOnReset(IClearingHouse.VTokenPositionView memory vTokenPosition) internal override {
        if (!isReset) revert ETRS_INVALID_CLOSE();
        int256 tokensToTrade = -vTokenPosition.netTraderPosition;
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
        IClearingHouseStructures.SwapParams memory swapParams = IClearingHouseStructures.SwapParams(
            tokensToTrade,
            sqrtPriceLimitX96,
            false,
            true
        );
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

    /// @notice Get liquidity change params on deposit
    /// @param amountAfterDeposit Amount of asset tokens after deposit
    /// @param amountDeposited Amount of asset tokens deposited
    function _getLiquidityChangeParamsAfterDeposit(uint256 amountAfterDeposit, uint256 amountDeposited)
        internal
        view
        returns (IClearingHouseStructures.LiquidityChangeParams memory liquidityChangeParam)
    {
        uint256 amountBeforeDeposit = amountAfterDeposit - amountDeposited;
        int128 liquidityDelta = baseLiquidity.toInt256().mulDiv(amountDeposited, amountBeforeDeposit).toInt128();
        liquidityChangeParam = _getLiquidityChangeParams(baseTickLower, baseTickUpper, liquidityDelta);
    }

    /// @notice Get liquidity change params on withdraw
    /// @param amountBeforeWithdraw Amount of asset tokens after withdraw
    /// @param amountWithdrawn Amount of asset tokens withdrawn
    function _getLiquidityChangeParamsBeforeWithdraw(uint256 amountBeforeWithdraw, uint256 amountWithdrawn)
        internal
        view
        returns (IClearingHouseStructures.LiquidityChangeParams memory liquidityChangeParam)
    {
        int128 liquidityDelta = -baseLiquidity.toInt256().mulDiv(amountWithdrawn, amountBeforeWithdraw).toInt128();
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
            IClearingHouseEnums.LimitOrderType.NONE
        );
    }
}
