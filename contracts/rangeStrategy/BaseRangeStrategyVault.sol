// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;
import { BaseVault } from '../base/BaseVault.sol';

import { IClearingHouse, IVToken, IUniswapV3Pool } from '@ragetrade/contracts/contracts/interfaces/IClearingHouse.sol';
import { UniswapV3PoolHelper } from '@ragetrade/contracts/contracts/libraries/UniswapV3PoolHelper.sol';

import { SignedFullMath } from '@ragetrade/contracts/contracts/libraries/SignedFullMath.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { FixedPoint96 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint96.sol';

import { SafeCast } from '../libraries/SafeCast.sol';

import { SignedMath } from '@ragetrade/contracts/contracts/libraries/SignedMath.sol';

import { TickMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/TickMath.sol';

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

    function getLiquidityChangeParams(
        IClearingHouse.VTokenPositionView memory vTokenPosition,
        IClearingHouse.RageTradePool memory rageTradePool,
        int256 vaultMarketValue
    ) internal view override returns (IClearingHouse.LiquidityChangeParams[4] memory liquidityChangeParamList) {
        //Get net token position
        //Remove reabalance
        //Add new rebalance range
        //Update base range liquidity
        int256 netPosition = rageClearingHouse.getNetTokenPosition(rageAccountNo, VWETH_TRUNCATED_ADDRESS);
        uint160 twapSqrtPriceX96 = rageTradePool.vPool.twapSqrtPrice(rageTradePool.settings.twapDuration);

        uint8 liqCount = 0;
        if (netPosition != 0) {
            //Rebalance Range
            uint160 sqrtPriceLowerX96;
            uint160 sqrtPriceUpperX96;
            int128 liquidityDelta;
            if (netPosition > 0) {
                sqrtPriceLowerX96 = twapSqrtPriceX96;
                sqrtPriceUpperX96 = uint256(twapSqrtPriceX96).mulDiv(104880885, 1e8).toUint160(); //multiplication by sqrt(1.1)

                //liquidityDelta = netTokenPositionAccrued * sqrtPCurrent * (sqrt(1+r) +1+r)/r
                //for r=.1 -> (sqrt(1+r) +1+r)/r = 21.48808848
                liquidityDelta = netPosition
                    .mulDiv(int256(2148808848), 1e8)
                    .mulDiv(twapSqrtPriceX96, FixedPoint96.Q96)
                    .toInt128();
            } else {
                sqrtPriceLowerX96 = uint256(twapSqrtPriceX96).mulDiv(94868330, 1e8).toUint160(); //multiplication by sqrt(.9)
                sqrtPriceUpperX96 = twapSqrtPriceX96;

                //liquidityDelta = -netTokenPositionAccrued * sqrtPCurrent * (sqrt(1-r) +1-r)/r
                //for r=.1 -> (sqrt(1-r) +1-r)/r = 18.48683298
                liquidityDelta = netPosition
                    .mulDiv(int256(1848683298), 1e8)
                    .mulDiv(twapSqrtPriceX96, FixedPoint96.Q96)
                    .toInt128();
            }

            liquidityChangeParamList[liqCount] = IClearingHouse.LiquidityChangeParams(
                TickMath.getTickAtSqrtRatio(sqrtPriceLowerX96),
                TickMath.getTickAtSqrtRatio(sqrtPriceUpperX96),
                liquidityDelta,
                0,
                0,
                false,
                IClearingHouse.LimitOrderType.NONE
            );
            liqCount++;
        }

        {
            //Base Range

            //LiquidityDelta = (vaultMarketValue / (sqrtPCurrent * MMargin) - abs(netTokenPositionAccrued)* sqrtPCurrent)* (sqrt(1-b) +1-b)/b
            //for b=0.4 (sqrt(1-b) +1-b)/b=

            int128 liquidityDelta;
            {
                int256 liquidityDeltaTerm1 = vaultMarketValue.mulDiv(FixedPoint96.Q96, twapSqrtPriceX96).mulDiv(
                    1e4,
                    rageTradePool.settings.maintainanceMarginRatio
                );
                int256 liquidityDeltaTerm2 = netPosition.abs().mulDiv(twapSqrtPriceX96, FixedPoint96.Q96); //multiplication by (sqrt(1-b) +1-b)/b

                liquidityDelta = (liquidityDeltaTerm1 - liquidityDeltaTerm2).mulDiv(int256(343649167), 1e8).toInt128();
            }

            uint160 sqrtPriceLowerX96 = uint256(twapSqrtPriceX96).mulDiv(77459667, 1e8).toUint160(); //multiplication by sqrt(0.6)
            uint160 sqrtPriceUpperX96 = uint256(twapSqrtPriceX96).mulDiv(118321596, 1e8).toUint160(); //multiplication by sqrt(1.4)

            liquidityChangeParamList[liqCount] = IClearingHouse.LiquidityChangeParams(
                TickMath.getTickAtSqrtRatio(sqrtPriceLowerX96),
                TickMath.getTickAtSqrtRatio(sqrtPriceUpperX96),
                liquidityDelta,
                0,
                0,
                false,
                IClearingHouse.LimitOrderType.NONE
            );
            liqCount++;
        }
        {
            //Remove previous ranges
            IClearingHouse.LiquidityPositionView[] memory liquidityPositions = vTokenPosition.liquidityPositions;
            for (uint8 i = 0; i < liquidityPositions.length; ++i) {
                assert(liquidityPositions[i].tickLower != 0);
                assert(liquidityPositions[i].tickUpper != 0);
                assert(liquidityPositions[i].liquidity != 0);

                liquidityChangeParamList[liqCount] = IClearingHouse.LiquidityChangeParams(
                    liquidityPositions[i].tickLower,
                    liquidityPositions[i].tickUpper,
                    -(liquidityPositions[i].liquidity.toInt128()),
                    0,
                    0,
                    false,
                    IClearingHouse.LimitOrderType.NONE
                );
                liqCount++;
            }
        }
    }
}
