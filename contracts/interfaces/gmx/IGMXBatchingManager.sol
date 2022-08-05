// SPDX-License-Identifier: MIT

import { IERC4626 } from '../IERC4626.sol';

pragma solidity ^0.8.0;

interface IGMXBatchingManager {
    error InvalidVault(address vault);
    error InvalidInput(uint256 errorCode);
    error InsufficientShares(uint256 balance);
    error InvalidSetDepositPaused(bool currentValue);

    error ZeroBalance();

    error VaultAlreadyAdded();
    error VaultsLimitExceeded();

    error CallerNotKeeper();
    error CallerNotStakingManager();

    event DepositToken(
        uint256 indexed round,
        address indexed token,
        address indexed receiver,
        uint256 amount,
        uint256 glpStaked
    );
    event VaultDeposit(uint256 vaultGlpAmount);
    event BatchDeposit(uint256 indexed round, uint256 userGlpAmount, uint256 userShareAmount);
    event SharesClaimed(address indexed from, address indexed receiver, uint256 claimAmount);
    event KeeperUpdated(address newKeeper);

    struct UserDeposit {
        uint256 round;
        uint128 glpBalance;
        uint128 unclaimedShares;
    }
    struct RoundDeposit {
        uint128 totalGlp;
        uint128 totalShares;
    }

    function depositToken(
        address token,
        uint256 amount,
        uint256 minUSDG
    ) external returns (uint256 glpStaked);

    function depositToken(
        IERC4626 gmxVault,
        address token,
        uint256 amount,
        uint256 minUSDG,
        address receiver
    ) external returns (uint256 glpStaked);

    function executeBatchDeposit() external;

    function stakingManagerGlpBalance() external view returns (uint256 balance);

    function glpBalanceAllVaults(address account) external view returns (uint256 balance);

    function glpBalance(IERC4626 gmxVault, address account) external view returns (uint256 balance);

    function unclaimedShares(IERC4626 gmxVault, address account) external view returns (uint256 shares);

    function claim(
        IERC4626 gmxVault,
        address receiver,
        uint256 amount
    ) external;
}
