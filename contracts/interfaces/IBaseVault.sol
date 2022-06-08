// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.9;

interface IBaseVault {
    function rebalance() external;

    function closeTokenPosition() external;

    function depositCap() external view returns (uint256);
}
