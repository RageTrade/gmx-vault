// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { SafeCast } from '../../libraries/SafeCast.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

import { IERC4626 } from 'contracts/interfaces/IERC4626.sol';
import { IGlpManager } from 'contracts/interfaces/gmx/IGlpManager.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';
import { IGMXBatchingManager } from 'contracts/interfaces/gmx/IGMXBatchingManager.sol';

contract GMXBatchingManager is IGMXBatchingManager, OwnableUpgradeable, PausableUpgradeable {
    using FullMath for uint256;
    using FullMath for uint128;
    using SafeCast for uint256;

    struct VaultBatchingState {
        uint256 currentRound;
        uint256 roundGlpBalance;
        mapping(address => UserDeposit) userDeposits;
        mapping(uint256 => RoundDeposit) roundDeposits;
    }

    uint256[100] private _gaps;

    address public keeper;
    address public stakingManager; // used for depositing harvested rewards

    uint16 public vaultCount;
    uint256 public stakingManagerGlpBalance;

    IERC20 private sGlp;
    IGlpManager private glpManager;
    IRewardRouterV2 private rewardRouter;

    mapping(IERC4626 => VaultBatchingState) public vaultBatchingState;

    IERC4626[10] public vaults;

    uint256[100] private _gaps2;

    modifier onlyStakingManager() {
        if (msg.sender != stakingManager) revert CallerNotStakingManager();
        _;
    }

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert CallerNotKeeper();
        _;
    }

    function initialize(
        IERC20 _sGlp,
        IRewardRouterV2 _rewardRouter,
        IGlpManager _glpManager,
        address _stakingManager,
        address _keeper
    ) external initializer {
        __Ownable_init();
        __Pausable_init();
        __GMXBatchingManager_init(_sGlp, _rewardRouter, _glpManager, _stakingManager, _keeper);
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __GMXBatchingManager_init(
        IERC20 _sGlp,
        IRewardRouterV2 _rewardRouter,
        IGlpManager _glpManager,
        address _stakingManager,
        address _keeper
    ) internal onlyInitializing {
        sGlp = _sGlp;
        rewardRouter = _rewardRouter;
        glpManager = _glpManager;

        stakingManager = _stakingManager;

        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    /// @notice grants the allowance to the vault to pull sGLP (via safeTransfer from in vault.deposit)
    /// @dev allowance is granted while vault is added via addVault, this is only failsafe if that allowance is exhausted
    /// @param gmxVault address of gmx vault
    function grantAllowances(IERC4626 gmxVault) external onlyOwner {
        _ensureVaultIsValid(gmxVault);
        sGlp.approve(address(gmxVault), type(uint256).max);
    }

    /// @notice sets the keeper address (to pause & unpause deposits)
    /// @param _keeper address of keeper
    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    /// @notice pauses deposits (to prevent DOS due to GMX 15 min cooldown)
    function pauseDeposit() external onlyKeeper {
        _pause();
    }

    /// @notice unpauses the deposit function
    function unpauseDeposit() external onlyKeeper {
        _unpause();
    }

    /// @notice convert the token into glp and obtain staked glp
    /// @dev this function should be only called by staking manager
    /// @param token address of input token (should be supported on gmx)
    /// @param amount amount of token to be used
    /// @param minUSDG minimum output of swap in terms of USDG
    function depositToken(
        address token,
        uint256 amount,
        uint256 minUSDG
    ) external whenNotPaused onlyStakingManager returns (uint256 glpStaked) {
        if (token == address(0)) revert InvalidInput(0x30);
        if (amount == 0) revert InvalidInput(0x31);

        IERC20(token).transferFrom(msg.sender, address(this), amount);

        // Convert tokens to glp
        glpStaked = _stakeGlp(token, amount, minUSDG);
        stakingManagerGlpBalance += glpStaked.toUint128();

        emit DepositToken(0, token, msg.sender, amount, glpStaked);
    }

    /// @notice convert the token into glp and obtain staked glp and deposits sGLP into vault
    /// @param gmxVault address of vault in which sGLP should be deposited
    /// @param token address of input token (should be supported on gmx)
    /// @param amount amount of token to be used
    /// @param minUSDG minimum output of swap in terms of USDG
    /// @param receiver address which will receive shares from vault+
    function depositToken(
        IERC4626 gmxVault,
        address token,
        uint256 amount,
        uint256 minUSDG,
        address receiver
    ) external whenNotPaused returns (uint256 glpStaked) {
        if (token == address(0)) revert InvalidInput(0x20);
        if (amount == 0) revert InvalidInput(0x21);
        if (receiver == address(0)) revert InvalidInput(0x22);

        // input vault address should be valid registered vault
        _ensureVaultIsValid(gmxVault);

        // Transfer Tokens To Manager
        IERC20(token).transferFrom(msg.sender, address(this), amount);

        VaultBatchingState storage state = vaultBatchingState[gmxVault];
        UserDeposit storage userDeposit = state.userDeposits[receiver];
        uint128 userGlpBalance = userDeposit.glpBalance;

        //Convert previous round glp balance into unredeemed shares
        uint256 userDepositRound = userDeposit.round;
        if (userDepositRound < state.currentRound && userGlpBalance > 0) {
            RoundDeposit storage roundDeposit = state.roundDeposits[userDepositRound];
            userDeposit.unclaimedShares += userDeposit
                .glpBalance
                .mulDiv(roundDeposit.totalShares, roundDeposit.totalGlp)
                .toUint128();
            userGlpBalance = 0;
        }

        // Convert tokens to glp
        glpStaked = _stakeGlp(token, amount, minUSDG);

        //Update round and glp balance for current round
        userDeposit.round = state.currentRound;
        userDeposit.glpBalance = userGlpBalance + glpStaked.toUint128();
        state.roundGlpBalance += glpStaked.toUint128();

        emit DepositToken(state.currentRound, token, receiver, amount, glpStaked);
    }

    /// @notice executes batch and deposits into appropriate vault with/without minting shares
    function executeBatchDeposit() external {
        // Transfer vault glp directly
        // Needs to be called only for StakingManager
        if (stakingManagerGlpBalance > 0) {
            uint256 glpToTransfer = stakingManagerGlpBalance;
            stakingManagerGlpBalance = 0;
            sGlp.transfer(address(stakingManager), glpToTransfer);
            emit VaultDeposit(glpToTransfer);
        }

        for (uint256 i = 0; i < vaults.length; i++) {
            IERC4626 vault = vaults[i];
            if (address(vault) == address(0)) break;

            _executeVaultUserBatchDeposit(vault);
        }
        // If the deposit is paused then unpause on execute batch deposit
        if (paused()) {
            _unpause();
        }
    }

    function _executeVaultUserBatchDeposit(IERC4626 vault) internal {
        VaultBatchingState storage state = vaultBatchingState[vault];

        // Transfer user glp through deposit
        if (state.roundGlpBalance > 0) {
            uint256 totalShares = vault.deposit(state.roundGlpBalance, address(this));

            // Update round data
            state.roundDeposits[state.currentRound] = RoundDeposit(
                state.roundGlpBalance.toUint128(),
                totalShares.toUint128()
            );

            emit BatchDeposit(state.currentRound, state.roundGlpBalance, totalShares);

            state.roundGlpBalance = 0;
            ++state.currentRound;
        }
    }

    /// @notice get the glp balance for a given vault and account address
    /// @param gmxVault address of vault
    /// @param account address of user
    function glpBalance(IERC4626 gmxVault, address account) public view returns (uint256 balance) {
        balance = vaultBatchingState[gmxVault].userDeposits[account].glpBalance;
    }

    /// @notice gives the combined pending glp balance from all registered vaults
    /// @param account address of user
    function glpBalanceAllVaults(address account) external view returns (uint256 balance) {
        for (uint256 i; i < vaults.length; i++) {
            balance += glpBalance(vaults[i], account);
        }
    }

    /// @notice get the unclaimed shares for a given vault and account address
    /// @param gmxVault address of vault
    /// @param account address of user
    function unclaimedShares(IERC4626 gmxVault, address account) external view returns (uint256 shares) {
        shares = vaultBatchingState[gmxVault].userDeposits[account].unclaimedShares;
    }

    /// @notice claim the shares received from depositing batch
    /// @param gmxVault address of vault (shares of this vault will be withdrawn)
    /// @param receiver address of receiver
    /// @param amount amount of shares
    function claim(
        IERC4626 gmxVault,
        address receiver,
        uint256 amount
    ) external {
        if (receiver == address(0)) revert InvalidInput(0x10);
        if (amount == 0) revert InvalidInput(0x11);

        VaultBatchingState storage state = vaultBatchingState[gmxVault];
        UserDeposit storage userDeposit = state.userDeposits[msg.sender];
        uint128 userUnclaimedShares = userDeposit.unclaimedShares;
        uint128 userGlpBalance = userDeposit.glpBalance;
        {
            //Convert previous round glp balance into unredeemed shares
            uint256 userDepositRound = userDeposit.round;
            if (userDepositRound < state.currentRound && userGlpBalance > 0) {
                RoundDeposit storage roundDeposit = state.roundDeposits[userDepositRound];
                userUnclaimedShares += userGlpBalance
                    .mulDiv(roundDeposit.totalShares, roundDeposit.totalGlp)
                    .toUint128();
                userDeposit.glpBalance = 0;
            }
        }
        if (userUnclaimedShares < amount.toUint128()) revert InsufficientShares(userUnclaimedShares);
        userDeposit.unclaimedShares = userUnclaimedShares - amount.toUint128();
        IERC20(gmxVault).transfer(receiver, amount);

        emit SharesClaimed(msg.sender, receiver, amount);
    }

    /// @notice gets the current active round
    /// @param vault address of vault
    function currentRound(IERC4626 vault) external view returns (uint256) {
        return vaultBatchingState[vault].currentRound;
    }

    /// @notice get the glp balance for current active round
    /// @param vault address of vault
    function roundGlpBalance(IERC4626 vault) external view returns (uint256) {
        return vaultBatchingState[vault].roundGlpBalance;
    }

    /// @notice get the state of user deposits
    /// @param vault address of vault
    /// @param account address of user
    function userDeposits(IERC4626 vault, address account) external view returns (UserDeposit memory) {
        return vaultBatchingState[vault].userDeposits[account];
    }

    /// @notice get the info for given vault and round
    /// @param vault address of vault
    /// @param round address of user
    function roundDeposits(IERC4626 vault, uint256 round) external view returns (RoundDeposit memory) {
        return vaultBatchingState[vault].roundDeposits[round];
    }

    /// @notice checks if vault is valid
    /// @param vault address of vault
    function isVaultValid(IERC4626 vault) external view returns (bool) {
        return _isVaultValid(vault);
    }

    function _stakeGlp(
        address token,
        uint256 amount,
        uint256 minUSDG
    ) internal returns (uint256 glpStaked) {
        // Convert tokens to glp and stake glp to obtain sGLP
        IERC20(token).approve(address(glpManager), amount);
        glpStaked = rewardRouter.mintAndStakeGlp(token, amount, minUSDG, 0);
    }

    /// @notice adds new vault to which deposits can be batched
    /// @param vault address of vault
    function addVault(IERC4626 vault) external onlyOwner {
        if (vaultCount == vaults.length) revert VaultsLimitExceeded();
        if (vaultBatchingState[vault].currentRound != 0) revert VaultAlreadyAdded();

        vaultBatchingState[vault].currentRound = 1;
        vaults[vaultCount] = vault;
        ++vaultCount;

        sGlp.approve(address(vault), type(uint256).max);

        emit VaultAdded(address(vault));
    }

    function _ensureVaultIsValid(IERC4626 vault) internal view {
        if (!_isVaultValid(vault)) revert InvalidVault(address(vault));
    }

    function _isVaultValid(IERC4626 vault) internal view returns (bool) {
        return vaultBatchingState[vault].currentRound != 0;
    }
}
