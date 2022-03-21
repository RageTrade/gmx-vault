// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

import { ERC20PresetMinterPauserUpgradeable as CollateralToken } from '@openzeppelin/contracts-upgradeable/token/ERC20/presets/ERC20PresetMinterPauserUpgradeable.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { IClearingHouseStructures } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseStructures.sol';
import { IVToken } from '@ragetrade/core/contracts/interfaces/IVToken.sol';
import { AddressHelper } from '@ragetrade/core/contracts/libraries/AddressHelper.sol';
import { SignedMath } from '@ragetrade/core/contracts/libraries/SignedMath.sol';
import { SignedFullMath } from '@ragetrade/core/contracts/libraries/SignedFullMath.sol';

import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';

import { IBaseVault } from '../interfaces/IBaseVault.sol';
import { IBaseYieldStrategy } from '../interfaces/IBaseYieldStrategy.sol';

import { SafeCast } from '../libraries/SafeCast.sol';

import { RageERC4626 } from './RageERC4626.sol';

abstract contract BaseVault is IBaseVault, RageERC4626, IBaseYieldStrategy, OwnableUpgradeable {
    using AddressHelper for address;
    using AddressHelper for IVToken;
    using SafeCast for uint256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SignedMath for int256;
    using SignedFullMath for int256;

    // TODO: Make relevant things immutable
    IERC20Metadata public rageBaseToken;
    IClearingHouse public rageClearingHouse;
    IERC20Metadata public rageCollateralToken;

    uint256 public rageAccountNo;
    uint32 public immutable ETH_poolId;

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        uint32 _ETH_poolId
    ) RageERC4626(_asset, _name, _symbol) {
        ETH_poolId = _ETH_poolId;
    }

    function __BaseVault_init(
        address _owner,
        address _rageClearingHouse,
        address _rageCollateralToken,
        address _rageBaseToken
    ) internal onlyInitializing {
        __Ownable_init();
        transferOwnership(_owner);
        rageClearingHouse = IClearingHouse(_rageClearingHouse);
        rageAccountNo = rageClearingHouse.createAccount();
        rageCollateralToken = IERC20Metadata(_rageCollateralToken);
        rageBaseToken = IERC20Metadata(_rageBaseToken);
        // Give rageClearingHouse full allowance of rageCollateralToken and usdc
    }

    function grantAllowances() external virtual {
        _grantBaseAllowances();
    }

    function _grantBaseAllowances() internal {
        rageCollateralToken.approve(address(rageClearingHouse), type(uint256).max);
        rageBaseToken.approve(address(rageClearingHouse), type(uint256).max);
    }

    function getVaultMarketValue() public view returns (int256 vaultMarketValue) {
        vaultMarketValue = rageClearingHouse.getAccountNetProfit(rageAccountNo);
        vaultMarketValue += (getMarketValue(asset.balanceOf(address(this)))).toInt256();
    }

    function _settleProfitAndCollateral(IClearingHouse.CollateralDepositView[] memory deposits, int256 vaultMarketValue)
        internal
    {
        // Settle net profit made from ranges and deposit/withdraw profits in USDC
        int256 netProfit = rageClearingHouse.getAccountNetProfit(rageAccountNo);
        if (netProfit > 0) {
            // If net profit > 0 withdraw USDC and convert USDC into LP tokens
            rageClearingHouse.updateProfit(rageAccountNo, -1 * netProfit);
            _depositBase(uint256(netProfit));
        } else if (netProfit < 0) {
            // If net profit > 0 convert LP tokens into USDC and deposit USDC to cover loss
            _withdrawBase(uint256(-1 * netProfit));
            rageClearingHouse.updateProfit(rageAccountNo, -1 * netProfit);
        }

        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        int256 vaultMarketValueDiff;
        if (deposits.length > 0) {
            assert(deposits.length == 1);
            IClearingHouse.CollateralDepositView memory stablecoinDeposit = deposits[0];
            assert(address(stablecoinDeposit.collateral) == address(rageCollateralToken));
            vaultMarketValueDiff =
                vaultMarketValue -
                stablecoinDeposit.balance.toInt256().mulDiv(
                    10**rageBaseToken.decimals(),
                    10**rageCollateralToken.decimals()
                );
        } else {
            vaultMarketValueDiff = vaultMarketValue;
        }
        // Settlement basis market value difference
        _settleCollateral(vaultMarketValueDiff);
    }

    function _settleCollateral(int256 vaultMarketValueDiff) internal {
        int256 normalizedVaultMarketValueDiff = vaultMarketValueDiff.mulDiv(
            10**rageCollateralToken.decimals(),
            10**rageBaseToken.decimals()
        );
        uint256 normalizedVaultMarketValueDiffAbs = normalizedVaultMarketValueDiff.absUint();

        if (normalizedVaultMarketValueDiff > 0) {
            // Mint collateral coins and deposit into rage trade
            assert(rageCollateralToken.balanceOf(address(this)) > normalizedVaultMarketValueDiffAbs);
            rageClearingHouse.addMargin(
                rageAccountNo,
                address(rageCollateralToken).truncate(),
                normalizedVaultMarketValueDiffAbs
            );
        } else if (normalizedVaultMarketValueDiff < 0) {
            // Withdraw rage trade deposits
            rageClearingHouse.removeMargin(
                rageAccountNo,
                address(rageCollateralToken).truncate(),
                normalizedVaultMarketValueDiffAbs
            );
        }
    }

    function rebalance() public {
        // Rebalance ranges based on the parameters passed
        IClearingHouse.CollateralDepositView[] memory deposits;
        IClearingHouse.VTokenPositionView[] memory vTokenPositions;
        // Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, , deposits, vTokenPositions) = rageClearingHouse.getAccountInfo(rageAccountNo);
        // (, uint256 virtualPriceX128) = rageClearingHouse.getTwapSqrtPricesForSetDuration(IVToken(VWETH_ADDRESS));
        int256 vaultMarketValue = getMarketValue(asset.balanceOf(address(this))).toInt256();

        _rebalanceProfitAndCollateral(deposits, vTokenPositions, vaultMarketValue);

        IClearingHouse.Pool memory rageTradePool = rageClearingHouse.getPoolInfo(ETH_poolId);

        // Step-4 Find the ranges and amount of liquidity to put in each
        _rebalanceRanges(vTokenPositions[0], rageTradePool, vaultMarketValue);

        // Step-5 Rebalance
    }

    function rebalanceProfitAndCollateral() public {
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

    // TODO: Uncomment stake and harvest fees
    function _rebalanceProfitAndCollateral(
        IClearingHouse.CollateralDepositView[] memory deposits,
        IClearingHouse.VTokenPositionView[] memory vTokenPositions,
        int256 vaultMarketValue
    ) internal {
        assert(
            vTokenPositions.length == 0 ||
                (vTokenPositions.length == 1 && vTokenPositions[0].vToken.truncate() == ETH_poolId)
        );
        // Harvest the rewards earned (Should be harvested before calculating vault market value)
        _harvestFees();

        _settleProfitAndCollateral(deposits, vaultMarketValue);

        // stake the remaining LP tokens
        _stake();
    }

    function _unrealizedBalance() internal view returns (uint256) {
        // Returns the unrealized pnl which includes pnl from ranges (FP+Fee+RangeIL) and Yield from the yield protocol
        // This is divided by the asset value to arrive at the number of unrealized asset tokens
        // This might be away from the actual value
    }

    function totalAssets() public view override returns (uint256) {
        return asset.balanceOf(address(this)) + _stakedAssetBalance();
    }

    function _beforeShareTransfer() internal override {
        rebalanceProfitAndCollateral();
    }

    function afterDeposit(uint256 amount) internal override {
        _afterDepositYield(amount);
        // _afterDepositRanges(amount);
    }

    function beforeWithdraw(uint256 amount) internal override {
        _beforeWithdrawRanges(amount);
        _beforeWithdrawYield(amount);
    }

    /*
        YIELD STRATEGY
    */

    function _stake() internal virtual;

    function _harvestFees() internal virtual;

    function getPriceX128() public view virtual returns (uint256 priceX128);

    function getMarketValue(uint256 amount) public view virtual returns (uint256 marketValue);

    // To convert yield token into USDC to cover loss on rage trade
    function _withdrawBase(uint256 amount) internal virtual;

    // To deposit the USDC profit made from rage trade into yield protocol
    function _depositBase(uint256 amount) internal virtual;

    function _stakedAssetBalance() internal view virtual returns (uint256);

    function _afterDepositYield(uint256 amount) internal virtual;

    function _beforeWithdrawYield(uint256 amount) internal virtual;

    /*
        RANGE STRATEGY
    */

    function _rebalanceRanges(
        IClearingHouse.VTokenPositionView memory vTokenPosition,
        IClearingHouse.Pool memory rageTradePool,
        int256 vaultMarketValue
    ) internal virtual;

    function _afterDepositRanges(uint256 amount) internal virtual;

    function _beforeWithdrawRanges(uint256 amount) internal virtual;
}
