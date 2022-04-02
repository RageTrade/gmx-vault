// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import { SafeCast } from '@uniswap/v3-core-0.8-support/contracts/libraries/SafeCast.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { TickMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/TickMath.sol';
import { IUniswapV3Pool } from '@uniswap/v3-core-0.8-support/contracts/interfaces/IUniswapV3Pool.sol';
import { IUniswapV3PoolDeployer } from '@uniswap/v3-core-0.8-support/contracts/interfaces/IUniswapV3PoolDeployer.sol';
import { IUniswapV3MintCallback } from '@uniswap/v3-core-0.8-support/contracts/interfaces/callback/IUniswapV3MintCallback.sol';
import { IUniswapV3SwapCallback } from '@uniswap/v3-core-0.8-support/contracts/interfaces/callback/IUniswapV3SwapCallback.sol';

import { IVPoolWrapper } from '@ragetrade/core/contracts/interfaces/IVPoolWrapper.sol';
import { IVQuote } from '@ragetrade/core/contracts/interfaces/IVQuote.sol';
import { IVToken } from '@ragetrade/core/contracts/interfaces/IVToken.sol';
import { IOracle } from '@ragetrade/core/contracts/interfaces/IOracle.sol';
import { IVToken } from '@ragetrade/core/contracts/interfaces/IVToken.sol';

import { FundingPayment } from '@ragetrade/core/contracts/libraries/FundingPayment.sol';
import { SimulateSwap } from '@ragetrade/core/contracts/libraries/SimulateSwap.sol';
import { PriceMath } from '@ragetrade/core/contracts/libraries/PriceMath.sol';
import { SignedMath } from '@ragetrade/core/contracts/libraries/SignedMath.sol';
import { SignedFullMath } from '@ragetrade/core/contracts/libraries/SignedFullMath.sol';
import { UniswapV3PoolHelper } from '@ragetrade/core/contracts/libraries/UniswapV3PoolHelper.sol';

import { VPoolWrapper } from '@ragetrade/core/contracts/protocol/wrapper/VPoolWrapper.sol';

contract VPoolWrapperMockRealistic is VPoolWrapper {
    uint48 public blockTimestamp;

    constructor() VPoolWrapper() {
        fpGlobal.timestampLast = 0;
    }

    function setFpGlobalLastTimestamp(uint48 timestamp) external {
        fpGlobal.timestampLast = timestamp;
    }

    function setBlockTimestamp(uint48 timestamp) external {
        blockTimestamp = timestamp;
    }

    function _blockTimestamp() internal view virtual override returns (uint48) {
        return blockTimestamp;
    }
}
