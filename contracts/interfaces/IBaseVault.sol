// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IBaseVault {
    function rebalanceRanges() external;

    function rebalanceProfitAndCollateral() external;
}
