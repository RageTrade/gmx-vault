// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.9;

import { ERC20PresetMinterPauser as CollateralToken } from '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { SignedMath } from '@ragetrade/core/contracts/libraries/SignedMath.sol';
import { SignedFullMath } from '@ragetrade/core/contracts/libraries/SignedFullMath.sol';
import { AddressHelper } from '@ragetrade/core/contracts/libraries/AddressHelper.sol';
import { UniswapV3PoolHelper, IUniswapV3Pool } from '@ragetrade/core/contracts/libraries/UniswapV3PoolHelper.sol';
import { Extsload } from '@ragetrade/core/contracts/utils/Extsload.sol';
import { ClearingHouseExtsload } from '@ragetrade/core/contracts/extsloads/ClearingHouseExtsload.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { FixedPoint96 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint96.sol';

import { IBaseVault } from '../interfaces/IBaseVault.sol';
import { IBaseYieldStrategy } from '../interfaces/IBaseYieldStrategy.sol';

import { RageERC4626 } from './RageERC4626.sol';
import { SafeCast } from '../libraries/SafeCast.sol';
import { Logic } from '../libraries/Logic.sol';

abstract contract BaseVault is IBaseVault, RageERC4626, IBaseYieldStrategy, OwnableUpgradeable, Extsload {
    using AddressHelper for address;

    using SafeCast for uint256;
    using SignedMath for int256;
    using SignedFullMath for int256;
    using ClearingHouseExtsload for IClearingHouse;

    address public swapSimulator;
    IClearingHouse public rageClearingHouse;

    IERC20Metadata internal rageSettlementToken;
    CollateralToken internal rageCollateralToken;

    uint32 public ethPoolId;
    uint256 public rageAccountNo;
    IUniswapV3Pool public rageVPool;

    uint256 public depositCap; // in vault assets

    uint64 public lastRebalanceTS;
    uint16 public rebalancePriceThresholdBps;
    uint32 public rebalanceTimeThreshold; // seconds

    address public keeper;

    error BV_InvalidRebalance();
    error BV_NoPositionToRebalance();
    error BV_DepositCap(uint256 depositCap, uint256 depositAmount);
    error BV_OnlyKeeperAllowed(address msgSender, address authorisedKeeperAddress);

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert BV_OnlyKeeperAllowed(msg.sender, keeper);
        _;
    }

    struct BaseVaultInitParams {
        RageERC4626InitParams rageErc4626InitParams;
        uint32 ethPoolId;
        address swapSimulator;
        address rageClearingHouse;
        address rageCollateralToken;
        address rageSettlementToken;
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __BaseVault_init(BaseVaultInitParams memory params) internal onlyInitializing {
        __Ownable_init();
        __RageERC4626_init(params.rageErc4626InitParams);

        ethPoolId = params.ethPoolId;
        swapSimulator = params.swapSimulator;

        rageClearingHouse = IClearingHouse(params.rageClearingHouse);
        rageAccountNo = rageClearingHouse.createAccount();
        rageCollateralToken = CollateralToken(params.rageCollateralToken);
        rageSettlementToken = IERC20Metadata(params.rageSettlementToken);

        rageVPool = rageClearingHouse.getVPool(ethPoolId);

        rebalancePriceThresholdBps = 500; //5%
        rebalanceTimeThreshold = 1 days;
        // Give rageClearingHouse full allowance of rageCollateralToken and usdc
    }

    function updateBaseParams(
        uint256 newDepositCap,
        address newKeeperAddress,
        uint32 _rebalanceTimeThreshold,
        uint16 _rebalancePriceThresholdBps
    ) external onlyOwner {
        keeper = newKeeperAddress;
        depositCap = newDepositCap;
        rebalanceTimeThreshold = _rebalanceTimeThreshold;
        rebalancePriceThresholdBps = _rebalancePriceThresholdBps;

        emit Logic.BaseParamsUpdated(
            newDepositCap,
            newKeeperAddress,
            _rebalanceTimeThreshold,
            _rebalancePriceThresholdBps
        );
    }

    /// @notice grants relevant allowances
    function grantAllowances() external virtual {
        _grantBaseAllowances();
    }

    /// @notice Rebalance the vault assets
    function rebalance() public virtual onlyKeeper {
        int256 vaultMarketValue = getVaultMarketValue();

        if (!isValidRebalance(vaultMarketValue)) {
            revert BV_InvalidRebalance();
        }
        // Rebalance ranges based on the parameters passed
        IClearingHouse.CollateralDepositView[] memory deposits;
        IClearingHouse.VTokenPositionView[] memory vTokenPositions;
        // Step-0 Check if the rebalance can go through (time and threshold based checks)
        (deposits, vTokenPositions) = _rebalanceProfitAndCollateral();

        // Step-4 Rebalance
        if (vTokenPositions.length == 0) revert BV_NoPositionToRebalance();
        _rebalanceRanges(vTokenPositions[0], vaultMarketValue);

        // Post rebalance
        lastRebalanceTS = uint64(_blockTimestamp());

        emit Logic.Rebalance();
    }

    /// @notice closes remaining token position (To be used when reset condition is hit)
    function closeTokenPosition() external onlyKeeper {
        IClearingHouse.VTokenPositionView[] memory vTokenPositions;
        // Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, , , vTokenPositions) = rageClearingHouse.getAccountInfo(rageAccountNo);

        _closeTokenPositionOnReset(vTokenPositions[0]);
    }

    /// @notice returns the total vault asset balance + staked balance
    function totalAssets() public view override returns (uint256) {
        return asset.balanceOf(address(this)) + _stakedAssetBalance();
    }

    /// @notice Returns account market value of vault in USDC (settlement token)
    function getVaultMarketValue() public view returns (int256 vaultMarketValue) {
        vaultMarketValue = rageClearingHouse.getAccountNetProfit(rageAccountNo);
        vaultMarketValue += (getMarketValue(totalAssets())).toInt256();
    }

    /// @notice grants allowances for base vault
    function _grantBaseAllowances() internal {
        rageCollateralToken.approve(address(rageClearingHouse), type(uint256).max);
        rageSettlementToken.approve(address(rageClearingHouse), type(uint256).max);
    }

    /// @notice settles profit and collateral for the vault
    /// @param deposits The amount of collateral deposited to rage core
    /// @param vaultMarketValue The market value of the vault in USDC
    function _settleProfitAndCollateral(IClearingHouse.CollateralDepositView[] memory deposits, int256 vaultMarketValue)
        internal
    {
        // Settle net profit made from ranges and deposit/withdraw profits in USDC
        int256 netProfit = rageClearingHouse.getAccountNetProfit(rageAccountNo);
        if (netProfit > 0) {
            // If net profit > 0 withdraw USDC and convert USDC into LP tokens
            rageClearingHouse.updateProfit(rageAccountNo, -1 * netProfit);
            _convertSettlementTokenToAsset(uint256(netProfit));
        } else if (netProfit < 0) {
            // If net profit > 0 convert LP tokens into USDC and deposit USDC to cover loss
            uint256 settlementTokenOutput = _convertAssetToSettlementToken(uint256(-1 * netProfit));

            if (settlementTokenOutput > 0) {
                rageClearingHouse.updateProfit(rageAccountNo, settlementTokenOutput.toInt256());
            }
        }

        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        int256 vaultMarketValueDiff;
        if (deposits.length > 0) {
            //Since USDC never deposited as margin so there would just be 1 collateral
            // assert(deposits.length == 1);
            IClearingHouse.CollateralDepositView memory stablecoinDeposit = deposits[0];
            // assert(address(stablecoinDeposit.collateral) == address(rageCollateralToken));
            vaultMarketValueDiff =
                vaultMarketValue -
                stablecoinDeposit.balance.toInt256().mulDiv(
                    10**rageSettlementToken.decimals(),
                    10**rageCollateralToken.decimals()
                );
        } else {
            vaultMarketValueDiff = vaultMarketValue;
        }
        // Settlement basis market value difference
        _settleCollateral(vaultMarketValueDiff);
    }

    /// @notice settles collateral for the vault
    /// @dev to be called after settle profits only (since vaultMarketValue if after settlement of profits)
    /// @param vaultMarketValueDiff The difference in current and previous market value of the vault in USDC
    function _settleCollateral(int256 vaultMarketValueDiff) internal {
        int256 normalizedVaultMarketValueDiff = vaultMarketValueDiff.mulDiv(
            10**rageCollateralToken.decimals(),
            10**rageSettlementToken.decimals()
        );
        uint256 normalizedVaultMarketValueDiffAbs = normalizedVaultMarketValueDiff.absUint();

        if (normalizedVaultMarketValueDiff > 0) {
            // Mint collateral coins and deposit into rage trade
            rageCollateralToken.mint(address(this), normalizedVaultMarketValueDiffAbs);
            rageClearingHouse.updateMargin(
                rageAccountNo,
                address(rageCollateralToken).truncate(),
                int256(normalizedVaultMarketValueDiffAbs)
            );
        } else if (normalizedVaultMarketValueDiff < 0) {
            // Withdraw rage trade deposits
            rageClearingHouse.updateMargin(
                rageAccountNo,
                address(rageCollateralToken).truncate(),
                -int256(normalizedVaultMarketValueDiffAbs)
            );
            rageCollateralToken.burn(normalizedVaultMarketValueDiffAbs);
        }
    }

    function _isValidRebalanceTime() internal view returns (bool) {
        return _blockTimestamp() - lastRebalanceTS > rebalanceTimeThreshold;
    }

    function isValidRebalance(int256 vaultMarketValue) public view returns (bool isValid) {
        return _isValidRebalanceTime() || _isValidRebalanceRange(vaultMarketValue);
    }

    /// @notice Rebalances the pnl on rage trade and converts profit into asset tokens and covers losses using asset tokens
    /// @notice Rebalances collateral based on the updated market value of vault assets
    function _rebalanceProfitAndCollateral()
        internal
        returns (
            IClearingHouse.CollateralDepositView[] memory deposits,
            IClearingHouse.VTokenPositionView[] memory vTokenPositions
        )
    {
        // Rebalance collateral and dummy stable coins representing the collateral
        // Update protocol and management fee accumulated

        // Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, , deposits, vTokenPositions) = rageClearingHouse.getAccountInfo(rageAccountNo);
        // #Token position = 0 or (1 and token should be VWETH)
        int256 vaultMarketValue = getVaultMarketValue();

        // assert(vTokenPositions.length == 0 || (vTokenPositions.length == 1 && vTokenPositions[0].poolId == ethPoolId));
        // Harvest the rewards earned (Should be harvested before calculating vault market value)
        _harvestFees();

        _settleProfitAndCollateral(deposits, vaultMarketValue);
        // stake the remaining LP tokens
        _stake(asset.balanceOf(address(this)));
    }

    /// @notice returns twap price X96 from rage trade
    function _getTwapSqrtPriceX96() internal view returns (uint160 twapSqrtPriceX96) {
        twapSqrtPriceX96 = Logic.getTwapSqrtPriceX96(rageVPool, rageClearingHouse.getTwapDuration(ethPoolId));
    }

    /// @notice converts all non-asset balances into asset
    /// @dev to be called before functions which allocate and deallocate shares (deposit, withdraw, mint and redeem)
    function _beforeShareAllocation() internal virtual override {
        _rebalanceProfitAndCollateral();
    }

    /// @notice assets are staked first into gauge before updating range liquidity position
    function afterDeposit(
        uint256 amount,
        uint256 /** shares **/
    ) internal virtual override {
        if (totalAssets() > depositCap) revert BV_DepositCap(depositCap, totalAssets());
        _afterDepositYield(amount);
        _afterDepositRanges(totalAssets(), amount);
    }

    /// @notice handling accounting on rage first before withdrawing assets (unstaking from gauge)
    function beforeWithdraw(
        uint256 amount,
        uint256 /** shares **/
    ) internal virtual override {
        _beforeWithdrawRanges(totalAssets(), amount);
        _beforeWithdrawYield(amount);
    }

    /// @notice reduce withdraw/redeem amount if position is reduced on rage trade to limit slippage
    /// @dev to be called before functions which allows to withdraw collateral (withdraw, redeem)
    function beforeWithdrawClosePosition(int256 tokensToTrade) internal virtual override {
        _beforeWithdrawClosePositionRanges(tokensToTrade);
    }

    function _blockTimestamp() internal view virtual returns (uint256) {
        /* solhint-disable-next-line not-rely-on-time */
        return block.timestamp;
    }

    /// @notice Get token notional absolute
    /// @param tokenAmount Token amount
    /// @param sqrtPriceX96 Sqrt of price in X96
    function _getTokenNotionalAbs(int256 tokenAmount, uint160 sqrtPriceX96)
        internal
        pure
        returns (uint256 tokenNotionalAbs)
    {
        tokenNotionalAbs = tokenAmount
            .mulDiv(sqrtPriceX96, FixedPoint96.Q96)
            .mulDiv(sqrtPriceX96, FixedPoint96.Q96)
            .absUint();
    }

    /*
        YIELD STRATEGY
    */
    function getPriceX128() public view virtual returns (uint256 priceX128);

    function getMarketValue(uint256 amount) public view virtual returns (uint256 marketValue);

    function _stake(uint256 amount) internal virtual;

    function _harvestFees() internal virtual;

    /// @notice converts given amount of settlement token from asset token
    /// @param amount The amount of settlement token to created from asset token
    function _convertAssetToSettlementToken(uint256 amount) internal virtual returns (uint256 usdcAmount);

    /// @notice converts given amount of settlement token to asset token
    /// @param amount The amount of settlement token to be converted to asset token
    function _convertSettlementTokenToAsset(uint256 amount) internal virtual;

    /// @notice amount of asset tokens staked
    function _stakedAssetBalance() internal view virtual returns (uint256);

    function _afterDepositYield(uint256 amount) internal virtual;

    function _beforeWithdrawYield(uint256 amount) internal virtual;

    /*
        RANGE STRATEGY
    */

    /// @notice rebalance range added to rage trade
    /// @param vTokenPosition The token position of the vault of eth pool
    /// @param vaultMarketValue The market value of the vault in USDC
    function _rebalanceRanges(IClearingHouse.VTokenPositionView memory vTokenPosition, int256 vaultMarketValue)
        internal
        virtual;

    /// @notice closes token position
    function _closeTokenPositionOnReset(IClearingHouse.VTokenPositionView memory vTokenPosition) internal virtual;

    /// @notice Updates liquidity position and collateral in rage core after deposit
    /// @param amountAfterDeposit The amount of asset tokens after deposit
    /// @param amountDeposited The amount of asset tokens deposited
    function _afterDepositRanges(uint256 amountAfterDeposit, uint256 amountDeposited) internal virtual;

    /// @notice Closes net token position before withdrawal
    /// @param tokensToTrade The amount of token position to close before withdrawal
    function _beforeWithdrawClosePositionRanges(int256 tokensToTrade) internal virtual;

    /// @notice Updates liquidity position and collateral in rage core before withdrawal
    /// @param amountBeforeWithdraw The amount of asset tokens before withdrawal
    /// @param amountWithdrawn The amount of asset tokens withdrawn
    function _beforeWithdrawRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn) internal virtual;

    /// @notice Checks if rebalance is valid based on range
    function _isValidRebalanceRange(int256 vaultMarketValue) internal view virtual returns (bool isValid);
}
