// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import { AggregatorV3Interface } from '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import { UniswapV3PoolHelper } from '@ragetrade/core/contracts/libraries/UniswapV3PoolHelper.sol';

import { FixedPoint96 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint96.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import { TickMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/TickMath.sol';
import { IUniswapV3Pool } from '@uniswap/v3-core-0.8-support/contracts/interfaces/IUniswapV3Pool.sol';

import { ICurveGauge } from '../interfaces/curve/ICurveGauge.sol';
import { ILPPriceGetter } from '../interfaces/curve/ILPPriceGetter.sol';
import { ICurveStableSwap } from '../interfaces/curve/ICurveStableSwap.sol';

import { SwapManager } from '../libraries/SwapManager.sol';
import { SafeCast } from '../libraries/SafeCast.sol';

library Logic {
    using SafeCast for uint256;
    using FullMath for uint256;
    using UniswapV3PoolHelper for IUniswapV3Pool;

    event Harvested(uint256 crvAmount);
    event Staked(uint256 amount, address indexed depositor);

    event FeesUpdated(uint256 fee);
    event FeesWithdrawn(uint256 total);

    event CurveParamsUpdated(
        uint256 feeBps,
        uint256 stablecoinSlippage,
        uint256 crvHarvestThreshold,
        uint256 crvSlippageTolerance,
        address indexed crvOracle
    );

    event CrvSwapFailedDueToSlippage(uint256 crvSlippageTolerance);

    event EightyTwentyParamsUpdated(
        uint16 closePositionSlippageSqrtToleranceBps,
        uint16 resetPositionThresholdBps,
        uint64 minNotionalPositionToCloseThreshold
    );

    event BaseParamsUpdated(
        uint256 newDepositCap,
        address newKeeperAddress,
        uint32 rebalanceTimeThreshold,
        uint16 rebalancePriceThresholdBps
    );

    event Rebalance();
    event TokenPositionClosed();

    event StateInfo(uint256 lpPrice);

    // base vault

    function getTwapSqrtPriceX96(IUniswapV3Pool rageVPool, uint32 rageTwapDuration)
        external
        view
        returns (uint160 twapSqrtPriceX96)
    {
        twapSqrtPriceX96 = rageVPool.twapSqrtPrice(rageTwapDuration);
    }

    function _getTwapSqrtPriceX96(IUniswapV3Pool rageVPool, uint32 rageTwapDuration)
        internal
        view
        returns (uint160 twapSqrtPriceX96)
    {
        twapSqrtPriceX96 = rageVPool.twapSqrtPrice(rageTwapDuration);
    }

    // 80 20

    function _simulateClose(
        uint32 ethPoolId,
        int256 tokensToTrade,
        uint160 sqrtPriceX96,
        IClearingHouse clearingHouse,
        ISwapSimulator swapSimulator,
        uint16 slippageSqrtToleranceBps
    ) internal view returns (int256 vTokenAmountOut, int256 vQuoteAmountOut) {
        uint160 sqrtPriceLimitX96;

        if (tokensToTrade > 0) {
            sqrtPriceLimitX96 = uint256(sqrtPriceX96).mulDiv(1e4 + slippageSqrtToleranceBps, 1e4).toUint160();
        } else {
            sqrtPriceLimitX96 = uint256(sqrtPriceX96).mulDiv(1e4 - slippageSqrtToleranceBps, 1e4).toUint160();
        }

        IVPoolWrapper.SwapResult memory swapResult = swapSimulator.simulateSwapView(
            clearingHouse,
            ethPoolId,
            tokensToTrade,
            sqrtPriceLimitX96,
            false
        );

        return (-swapResult.vTokenIn, -swapResult.vQuoteIn);
    }

    function simulateBeforeWithdraw(
        address vault,
        uint256 amountBeforeWithdraw,
        uint256 amountWithdrawn
    ) external view returns (uint256 updatedAmountWithdrawn, int256 tokensToTrade) {
        uint32 ethPoolId = IBaseVaultGetters(vault).ethPoolId();
        IClearingHouse clearingHouse = IClearingHouse(IBaseVaultGetters(vault).rageClearingHouse());

        uint160 sqrtPriceX96 = _getTwapSqrtPriceX96(
            IBaseVaultGetters(vault).rageVPool(),
            clearingHouse.getTwapDuration(ethPoolId)
        );

        int256 netPosition = clearingHouse.getAccountNetTokenPosition(
            IBaseVaultGetters(vault).rageAccountNo(),
            ethPoolId
        );

        tokensToTrade = -netPosition.mulDiv(amountWithdrawn, amountBeforeWithdraw);

        uint256 tokensToTradeNotionalAbs = _getTokenNotionalAbs(netPosition, sqrtPriceX96);

        uint64 minNotionalPositionToCloseThreshold = IBaseVaultGetters(vault).minNotionalPositionToCloseThreshold();
        uint16 closePositionSlippageSqrtToleranceBps = IBaseVaultGetters(vault).closePositionSlippageSqrtToleranceBps();

        ISwapSimulator swapSimulatorCopied = IBaseVaultGetters(vault).swapSimulator();

        if (tokensToTradeNotionalAbs > minNotionalPositionToCloseThreshold) {
            (int256 vTokenAmountOut, ) = _simulateClose(
                ethPoolId,
                tokensToTrade,
                sqrtPriceX96,
                clearingHouse,
                swapSimulatorCopied,
                closePositionSlippageSqrtToleranceBps
            );

            if (vTokenAmountOut == tokensToTrade) updatedAmountWithdrawn = amountWithdrawn;
            else {
                int256 updatedAmountWithdrawnInt = -vTokenAmountOut.mulDiv(
                    amountBeforeWithdraw.toInt256(),
                    netPosition
                );
                updatedAmountWithdrawn = uint256(updatedAmountWithdrawnInt);
                tokensToTrade = vTokenAmountOut;
            }
        } else {
            updatedAmountWithdrawn = amountWithdrawn;
            tokensToTrade = 0;
        }
    }

    /// @notice Get token notional absolute
    /// @param tokenAmount Token amount
    /// @param sqrtPriceX96 Sqrt of price in X96
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

    /// @notice checks if upper and lower ticks are valid for rebalacing between current twap price and rebalance threshold
    function isValidRebalanceRangeWithoutCheckReset(
        IUniswapV3Pool rageVPool,
        uint32 rageTwapDuration,
        uint16 rebalancePriceThresholdBps,
        int24 baseTickLower,
        int24 baseTickUpper
    ) external view returns (bool isValid) {
        uint256 twapSqrtPriceX96 = uint256(_getTwapSqrtPriceX96(rageVPool, rageTwapDuration));
        uint256 twapSqrtPriceX96Delta = twapSqrtPriceX96.mulDiv(rebalancePriceThresholdBps, 1e4);
        if (
            TickMath.getTickAtSqrtRatio((twapSqrtPriceX96 + twapSqrtPriceX96Delta).toUint160()) > baseTickUpper ||
            TickMath.getTickAtSqrtRatio((twapSqrtPriceX96 - twapSqrtPriceX96Delta).toUint160()) < baseTickLower
        ) isValid = true;
    }

    /// @notice convert sqrt price in X96 to initializable tick
    /// @param sqrtPriceX96 Sqrt of price in X96
    /// @param isTickUpper true if price represents upper tick and false if price represents lower tick
    function sqrtPriceX96ToValidTick(uint160 sqrtPriceX96, bool isTickUpper) external pure returns (int24 roundedTick) {
        int24 tick = TickMath.getTickAtSqrtRatio(sqrtPriceX96);
        if (isTickUpper) {
            roundedTick = tick + 10 - (tick % 10);
        } else {
            roundedTick = tick - (tick % 10);
        }

        if (tick < 0) roundedTick -= 10;
    }

    /// @notice helper to get nearest tick for sqrtPriceX96 (tickSpacing = 10)
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

    /// @notice Get updated base range params
    /// @param sqrtPriceX96 Sqrt of price in X96
    /// @param vaultMarketValue Market value of vault in USDC
    function getUpdatedBaseRangeParams(
        uint160 sqrtPriceX96,
        int256 vaultMarketValue,
        /* solhint-disable var-name-mixedcase */
        uint64 SQRT_PRICE_FACTOR_PIPS
    )
        external
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

        // assert(vaultMarketValue > 0);
        baseLiquidityUpdate = (
            uint256(vaultMarketValue).mulDiv(FixedPoint96.Q96 / 10, (sqrtPriceX96 - updatedSqrtPriceLowerX96))
        ).toUint128();
    }

    // curve yield strategy
    function convertAssetToSettlementToken(
        uint256 amount,
        uint256 slippage,
        ILPPriceGetter lpPriceHolder,
        ICurveGauge gauge,
        ICurveStableSwap triCryptoPool,
        IERC20 usdt,
        ISwapRouter uniV3Router,
        IERC20 usdc
    ) external returns (uint256 usdcAmount) {
        uint256 pricePerLP = lpPriceHolder.lp_price();
        uint256 lpToWithdraw = ((amount * (10**12)) * (10**18)) / pricePerLP;

        gauge.withdraw(lpToWithdraw);
        triCryptoPool.remove_liquidity_one_coin(lpToWithdraw, 0, 0);

        uint256 balance = usdt.balanceOf(address(this));

        bytes memory path = abi.encodePacked(usdt, uint24(500), usdc);

        usdcAmount = SwapManager.swapUsdtToUsdc(balance, slippage, path, uniV3Router);
    }

    function getMarketValue(uint256 amount, ILPPriceGetter lpPriceHolder) external view returns (uint256 marketValue) {
        marketValue = amount.mulDiv(_getPriceX128(lpPriceHolder), FixedPoint128.Q128);
    }

    function getPriceX128(ILPPriceGetter lpPriceHolder) external view returns (uint256 priceX128) {
        return _getPriceX128(lpPriceHolder);
    }

    function _getPriceX128(ILPPriceGetter lpPriceHolder) internal view returns (uint256 priceX128) {
        uint256 pricePerLP = lpPriceHolder.lp_price();
        return pricePerLP.mulDiv(FixedPoint128.Q128, 10**30); // 10**6 / (10**18*10**18)
    }
}
