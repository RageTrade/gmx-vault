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

import { console } from 'hardhat/console.sol';

abstract contract Strategy_80_20_Vault is BaseVault {
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
    uint64 public constant PRICE_FACTOR_PIPS = 640000; // scaled by 1e6 

    /*
        RANGE STRATEGY
    */

    function _afterDepositRanges(uint256 amount) internal override {
        int256 depositMarketValue = getMarketValue(amount).toInt256();
        _settleCollateral(depositMarketValue);

        // Add to base range based on the additional collateral
        // updateRangesAfterDeposit();
    }

    function _beforeWithdrawRanges(uint256 amount) internal override {
        // Remove from base range based on the collateral removal
        // updateRangesBeforeWithdraw();

        // Settle collateral based on updated value
        int256 depositMarketValue = getMarketValue(amount).toInt256();
        _settleCollateral(-depositMarketValue);
    }

    function _rebalanceRanges(
        IClearingHouse.VTokenPositionView memory vTokenPosition,
        IClearingHouse.RageTradePool memory rageTradePool,
        int256 vaultMarketValue
    ) internal override {
        IClearingHouse.LiquidityChangeParams[4] memory liquidityChangeParamList = getLiquidityChangeParams(
            vTokenPosition,
            rageTradePool,
            vaultMarketValue
        );

        for (uint8 i = 0; i < liquidityChangeParamList.length; i++) {
            if (liquidityChangeParamList[i].liquidityDelta == 0) break;
            rageClearingHouse.updateRangeOrder(rageAccountNo, VWETH_TRUNCATED_ADDRESS, liquidityChangeParamList[i]);
        }
    }

    function getLiquidityChangeParams(
        IClearingHouse.VTokenPositionView memory vTokenPosition,
        IClearingHouse.RageTradePool memory rageTradePool,
        int256 vaultMarketValue
    ) internal returns (IClearingHouse.LiquidityChangeParams[4] memory liquidityChangeParamList) {
        // Get net token position
        // Remove reabalance
        // Add new rebalance range
        // Update base range liquidity


        int256 netPosition = rageClearingHouse.getNetTokenPosition(rageAccountNo, VWETH_TRUNCATED_ADDRESS);
        uint256 twapSqrtPriceX96 = uint256(rageTradePool.vPool.twapSqrtPrice(rageTradePool.settings.twapDuration));

        int256 netPositionNotional = netPosition.mulDiv(twapSqrtPriceX96,FixedPoint96.Q96).mulDiv(twapSqrtPriceX96,FixedPoint96.Q96);
        
        uint160 sqrtPriceLowerX96 = twapSqrtPriceX96.mulDiv(PRICE_FACTOR_PIPS,1e6).toUint160();
        uint160 sqrtPriceUpperX96 = twapSqrtPriceX96.mulDiv(1e6,PRICE_FACTOR_PIPS).toUint160();
        baseTickLower = TickMath.getTickAtSqrtRatio(sqrtPriceLowerX96);
        baseTickUpper = TickMath.getTickAtSqrtRatio(sqrtPriceUpperX96);
        uint8 liqCount = 0;

        if(baseLiquidity>0) {
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
        // If (there are no ranges) || (netPositionNotional > 20% of vault market value) then update base liquidity
        if(baseLiquidity==0 || netPositionNotional*5>vaultMarketValue) {

            //TODO: change vaultMarketValue from int256 to uint256 and update type cast to a safe typecast function for uint128
            baseLiquidity = uint128(uint256(vaultMarketValue).mulDiv(FixedPoint96.Q96/10,(twapSqrtPriceX96 - sqrtPriceLowerX96)));


        //TODO: Check if there is a breach of threshold before rebalancing
        } else {

            liquidityChangeParamList[liqCount] = _getLiquidityChangeParams(
                baseTickLower,
                baseTickUpper,
                baseLiquidity.toInt128()
            );
            liqCount++;
        }
        //Add new range
        liquidityChangeParamList[liqCount] = _getLiquidityChangeParams(
            baseTickLower,
            baseTickUpper,
            baseLiquidity.toInt128()
        );
        liqCount++;
    }

    function _getLiquidityChangeParams(int24 tickLower, int24 tickUpper, int128 liquidityDelta) internal pure returns(IClearingHouse.LiquidityChangeParams memory liquidityChangeParam){
        liquidityChangeParam= IClearingHouse.LiquidityChangeParams(
                    tickLower,
                    tickUpper,
                    liquidityDelta,
                    0,
                    0,
                    false,
                    IClearingHouse.LimitOrderType.NONE
                );
    }
}
