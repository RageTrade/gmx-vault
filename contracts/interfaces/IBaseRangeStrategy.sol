// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import { IClearingHouse } from '@ragetrade/contracts/contracts/interfaces/IClearingHouse.sol';

interface IBaseRangeStrategy {
    // Gives the ticks for base and rebalance range
    function getLiquidityChangeParams()
        external
        returns (IClearingHouse.LiquidityChangeParams[] memory liquidityChangeParamList);
}
