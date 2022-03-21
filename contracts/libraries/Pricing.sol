// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { IUniswapV2Pair } from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

import { IAggregatorV3Interface } from '../interfaces/chainlink/IAggregatorV3Interface.sol';
import { HomoraMath } from '../libraries/HomoraMath.sol';

import { console } from 'hardhat/console.sol';

/// @title A library for performing various math operations on Price
library Pricing {
    using FullMath for uint256;

    function assetPriceX128(address tokenOracle, uint256 maxDelay) internal view returns (uint256 price) {
        uint8 decimals = IAggregatorV3Interface(tokenOracle).decimals();

        require(maxDelay != 0, 'NULL_DELAY');

        (, int256 answer, , uint256 updatedAt, ) = IAggregatorV3Interface(tokenOracle).latestRoundData();
        require(updatedAt >= block.timestamp - maxDelay, 'DELAYED');
        return (uint256(answer) * (FixedPoint128.Q128)) / (10**decimals);
    }

    /// @dev Return the value of the given input as ETH per unit, multiplied by 2**112.
    /// @param pair The Uniswap pair to check the value.
    function getUniV2LPPriceX128(
        address pair,
        address token0Oracle,
        address token1Oracle,
        uint8 baseDecimals,
        uint256 maxDelayTime
    ) internal view returns (uint256) {
        address token0 = IUniswapV2Pair(pair).token0();
        address token1 = IUniswapV2Pair(pair).token1();
        uint256 totalSupply = IUniswapV2Pair(pair).totalSupply();
        (uint256 r0, uint256 r1, ) = IUniswapV2Pair(pair).getReserves();

        uint8 tokenDecimals = IERC20Metadata(token0).decimals();
        tokenDecimals += IERC20Metadata(token1).decimals();

        uint256 sqrtK = HomoraMath.sqrt(r0 * r1).mulDiv(
            FixedPoint128.Q128 * 10**baseDecimals,
            totalSupply * HomoraMath.sqrt(10**tokenDecimals)
        ); // in 2**112

        uint256 px0 = assetPriceX128(token0Oracle, maxDelayTime); // in 2**112
        uint256 px1 = assetPriceX128(token1Oracle, maxDelayTime); // in 2**112

        // fair token0 amt: sqrtK * sqrt(px1/px0)
        // fair token1 amt: sqrtK * sqrt(px0/px1)
        // fair lp price = 2 * sqrt(px0 * px1)
        // split into 2 sqrts multiplication to prevent uint overflow (note the 2**112)
        return sqrtK.mulDiv(2 * HomoraMath.sqrt(px0) * HomoraMath.sqrt(px1), FixedPoint128.Q128);
    }
}
