// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IBaseVault {
    function rebalance() external;

    function rebalanceProfitAndCollateral() external;
}
