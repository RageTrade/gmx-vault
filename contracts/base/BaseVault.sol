// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

import { ERC20PresetMinterPauserUpgradeable as CollateralToken } from '@openzeppelin/contracts-upgradeable/token/ERC20/presets/ERC20PresetMinterPauserUpgradeable.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { IClearingHouseStructures } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseStructures.sol';
import { IVToken } from '@ragetrade/core/contracts/interfaces/IVToken.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { SignedMath } from '@ragetrade/core/contracts/libraries/SignedMath.sol';
import { SignedFullMath } from '@ragetrade/core/contracts/libraries/SignedFullMath.sol';

import { AddressHelper } from '@ragetrade/core/contracts/libraries/AddressHelper.sol';

import { IBaseVault } from '../interfaces/IBaseVault.sol';
import { IBaseYieldStrategy } from '../interfaces/IBaseYieldStrategy.sol';

import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';
import { RageERC4626 } from './RageERC4626.sol';

import { UniswapV3PoolHelper, IUniswapV3Pool } from '@ragetrade/core/contracts/libraries/UniswapV3PoolHelper.sol';

import { SafeCast } from '../libraries/SafeCast.sol';

abstract contract BaseVault is IBaseVault, RageERC4626, IBaseYieldStrategy, OwnableUpgradeable {
    using AddressHelper for address;
    using AddressHelper for IVToken;
    using SafeCast for uint256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SignedMath for int256;
    using SignedFullMath for int256;
    using UniswapV3PoolHelper for IUniswapV3Pool;

    // TODO: Make relevant things immutable
    IERC20Metadata public rageSettlementToken;
    IClearingHouse public rageClearingHouse;
    CollateralToken public rageCollateralToken;

    uint256 public rageAccountNo;
    uint32 public immutable ethPoolId;
    IClearingHouse.Pool public rageTradePool;
    uint64 public lastRebalanceTS;
    uint16 public rebalancePriceThresholdBps;

    uint256 public depositCap;

    address public keeper;

    error BV_InvalidRebalance();
    error BV_DepositCap(uint256 depositCap, uint256 depositAmount);
    error BV_OnlyKeeperAllowed(address keeperAddress, address msgSender);

    modifier onlyKeeper() {
        if (keeper != msg.sender) revert BV_OnlyKeeperAllowed(keeper, msg.sender);
        _;
    }

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        uint32 _ethPoolId
    ) RageERC4626(_asset, _name, _symbol) {
        ethPoolId = _ethPoolId;
    }

    // solhint-disable-next-line func-name-mixedcase
    function __BaseVault_init(
        address _owner,
        address _rageClearingHouse,
        address _rageCollateralToken,
        address _rageSettlementToken
    ) internal onlyInitializing {
        __Ownable_init();
        transferOwnership(_owner);
        rageClearingHouse = IClearingHouse(_rageClearingHouse);
        rageAccountNo = rageClearingHouse.createAccount();
        rageCollateralToken = CollateralToken(_rageCollateralToken);
        rageSettlementToken = IERC20Metadata(_rageSettlementToken);
        rageTradePool = rageClearingHouse.getPoolInfo(ethPoolId);
        // Give rageClearingHouse full allowance of rageCollateralToken and usdc
    }

    /// @notice Set the deposit cap for the vault in asset amount
    /// @param newDepositCap The new deposit cap in asset amount
    function updateDepositCap(uint256 newDepositCap) external onlyOwner {
        depositCap = newDepositCap;
    }

    /// @notice Deposit asset into the vault
    /// @dev Checks the deposit cap and the deposit amount
    /// @param amount The amount to deposit in asset amount
    /// @param to The address to deposit to
    function deposit(uint256 amount, address to) public virtual override returns (uint256 shares) {
        //TODO: Please fix this, cap should check the final amount after deposit and not the amount being deposited
        if (amount > depositCap) revert BV_DepositCap(depositCap, amount);

        return super.deposit(amount, to);
    }

    /// @notice grants relevant allowances
    function grantAllowances() external virtual {
        _grantBaseAllowances();
    }

    /// @notice Rebalance the vault assets
    function rebalance() public onlyKeeper {
        if (!_isValidRebalance()) {
            revert BV_InvalidRebalance();
        }
        // Rebalance ranges based on the parameters passed
        IClearingHouse.CollateralDepositView[] memory deposits;
        IClearingHouse.VTokenPositionView[] memory vTokenPositions;
        // Step-0 Check if the rebalance can go through (time and threshold based checks)
        // TODO getAccountInfo CALL may be optimised using extsload
        (, , deposits, vTokenPositions) = rageClearingHouse.getAccountInfo(rageAccountNo);
        // (, uint256 virtualPriceX128) = rageClearingHouse.getTwapSqrtPricesForSetDuration(IVToken(VWETH_ADDRESS));
        int256 vaultMarketValue = getMarketValue(asset.balanceOf(address(this))).toInt256();

        _rebalanceProfitAndCollateral(deposits, vTokenPositions, vaultMarketValue);

        // Step-4 Rebalance
        _rebalanceRanges(vTokenPositions[0], vaultMarketValue);
    }

    /// @notice closes remaining token position (To be used when reset condition is hit)
    function closeTokenPosition() public onlyKeeper {
        //TODO: Check if isReset check needs to be added
        IClearingHouse.VTokenPositionView[] memory vTokenPositions;
        // Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, , , vTokenPositions) = rageClearingHouse.getAccountInfo(rageAccountNo);

        _closeTokenPosition(vTokenPositions[0]);
    }

    /// @notice returns the total vault asset balance + staked balance
    function totalAssets() public view override returns (uint256) {
        return asset.balanceOf(address(this)) + _stakedAssetBalance();
    }

    // TODO: Add handling for unrealized fees
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
            _convertAssetToSettlementToken(uint256(-1 * netProfit));

            rageClearingHouse.updateProfit(rageAccountNo, -1 * netProfit);
        }

        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        int256 vaultMarketValueDiff;
        if (deposits.length > 0) {
            //Since USDC never deposited as margin so there would just be 1 collateral
            assert(deposits.length == 1);
            IClearingHouse.CollateralDepositView memory stablecoinDeposit = deposits[0];
            assert(address(stablecoinDeposit.collateral) == address(rageCollateralToken));
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

    /// @notice Checks if the rebalance is valid or not
    function _isValidRebalance() internal view returns (bool isValid) {
        //TODO: make rebalance period variable
        if (_blockTimestamp() - lastRebalanceTS > 1 days || _isValidRebalanceRange()) isValid = true;
    }

    /// @notice Rebalances the pnl on rage trade and converts profit into asset tokens and covers losses using asset tokens
    /// @notice Rebalances collateral based on the updated market value of vault assets
    function _rebalanceProfitAndCollateral() internal {
        // Rebalance collateral and dummy stable coins representing the collateral
        // Update protocol and management fee accumulated
        IClearingHouse.CollateralDepositView[] memory deposits;
        IClearingHouse.VTokenPositionView[] memory vTokenPositions;

        // Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, , deposits, vTokenPositions) = rageClearingHouse.getAccountInfo(rageAccountNo);
        // #Token position = 0 or (1 and token should be VWETH)
        int256 vaultMarketValue = getMarketValue(asset.balanceOf(address(this))).toInt256();

        _rebalanceProfitAndCollateral(deposits, vTokenPositions, vaultMarketValue);
    }

    /// @notice Rebalances the pnl on rage trade and converts profit into asset tokens and covers losses using asset tokens
    /// @notice Rebalances collateral based on the updated market value of vault assets
    /// @param deposits The amount of collateral deposited to rage core
    /// @param vTokenPositions The token positions of the vault
    /// @param vaultMarketValue The market value of the vault in USDC
    function _rebalanceProfitAndCollateral(
        IClearingHouse.CollateralDepositView[] memory deposits,
        IClearingHouse.VTokenPositionView[] memory vTokenPositions,
        int256 vaultMarketValue
    ) internal {
        assert(vTokenPositions.length == 0 || (vTokenPositions.length == 1 && vTokenPositions[0].poolId == ethPoolId));
        // Harvest the rewards earned (Should be harvested before calculating vault market value)
        _harvestFees();

        _settleProfitAndCollateral(deposits, vaultMarketValue);
        // stake the remaining LP tokens
        _stake(asset.balanceOf(address(this)));
    }

    // TODO: check if caching is required for this function
    /// @notice returns twap price X96 from rage trade
    function _getTwapSqrtPriceX96() internal view returns (uint160 twapSqrtPriceX96) {
        twapSqrtPriceX96 = rageTradePool.vPool.twapSqrtPrice(rageTradePool.settings.twapDuration);
    }

    /// @notice converts all non-asset balances into asset
    /// @dev to be called before functions which allocate and deallocate shares (deposit, withdraw, mint and burn)
    function _beforeShareAllocation() internal virtual override {
        _rebalanceProfitAndCollateral();
    }

    function afterDeposit(uint256 amount, uint256 shares) internal virtual override {
        _afterDepositYield(amount);
        _afterDepositRanges(totalAssets(), amount);
    }

    function beforeWithdraw(uint256 amount, uint256 shares) internal virtual override {
        _beforeWithdrawRanges(totalAssets(), amount);
        _beforeWithdrawYield(amount);
    }

    function beforeWithdrawClosePosition(uint256 amount) internal virtual override returns (uint256 updatedAmount) {
        return _beforeWithdrawClosePositionRanges(totalAssets(), amount);
    }

    function _blockTimestamp() internal view returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp;
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
    function _convertAssetToSettlementToken(uint256 amount) internal virtual;

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
    function _closeTokenPosition(IClearingHouse.VTokenPositionView memory vTokenPosition) internal virtual;

    /// @notice Updates liquidity position and collateral in rage core after deposit
    /// @param amountAfterDeposit The amount of asset tokens after deposit
    /// @param amountDeposited The amount of asset tokens deposited
    function _afterDepositRanges(uint256 amountAfterDeposit, uint256 amountDeposited) internal virtual;

    /// @notice Closes net token position before withdrawal
    /// @param amountBeforeWithdraw The amount of asset tokens before withdrawal
    /// @param amountWithdrawn The amount of asset tokens withdrawn
    function _beforeWithdrawClosePositionRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn)
        internal
        virtual
        returns (uint256 updatedAmountWithdrawn);

    /// @notice Updates liquidity position and collateral in rage core before withdrawal
    /// @param amountBeforeWithdraw The amount of asset tokens before withdrawal
    /// @param amountWithdrawn The amount of asset tokens withdrawn
    function _beforeWithdrawRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn) internal virtual;

    /// @notice Checks if rebalance is valid based on range
    function _isValidRebalanceRange() internal view virtual returns (bool isValid);
}
