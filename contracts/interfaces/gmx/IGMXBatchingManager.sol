// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IGMXBatchingManager {
    function depositToken(
        address token,
        uint256 amount,
        address receiver
    ) external returns (uint256 glpReceived);

    function executeBatchDeposit() external;

    function glpBalance(address account) external returns (uint256 balance);

    function claimableShares(address account) external returns (uint256 shares);

    function claim(address receiver, uint256 amount) external;
}
