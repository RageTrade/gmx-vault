// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.9;

interface IMMVault {
    error MM_InvalidRebalance();

    function rebalance() external;

    function updateMMParams() external;

    function approveSwap() external;

    function isValidRebalance() external;
}
