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
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { SafeCast } from '../libraries/SafeCast.sol';
import { RageERC4626 } from './RageERC4626.sol';
import { UniswapV3PoolHelper, IUniswapV3Pool } from '@ragetrade/core/contracts/libraries/UniswapV3PoolHelper.sol';

import { console } from 'hardhat/console.sol';

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
    IERC20Metadata public rageBaseToken;
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
        address _rageBaseToken
    ) internal onlyInitializing {
        __Ownable_init();
        transferOwnership(_owner);
        rageClearingHouse = IClearingHouse(_rageClearingHouse);
        rageAccountNo = rageClearingHouse.createAccount();
        rageCollateralToken = CollateralToken(_rageCollateralToken);
        rageBaseToken = IERC20Metadata(_rageBaseToken);
        rageTradePool = rageClearingHouse.getPoolInfo(ethPoolId);
        // Give rageClearingHouse full allowance of rageCollateralToken and usdc
    }

    function updateDepositCap(uint256 newDepositCap) external onlyOwner {
        depositCap = newDepositCap;
    }

    function deposit(uint256 amount, address to) public virtual override returns (uint256 shares) {
        if (amount > depositCap) revert BV_DepositCap(depositCap, amount);

        return super.deposit(amount, to);
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
            //Since USDC never deposited as margin so there would just be 1 collateral
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

        // Step-4 Find the ranges and amount of liquidity to put in each
        _rebalanceRanges(vTokenPositions[0], vaultMarketValue);

        // Step-5 Rebalance
    }

    function closeTokenPosition() public onlyKeeper {
        //TODO: Check if isReset check needs to be added
        IClearingHouse.VTokenPositionView[] memory vTokenPositions;
        // Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, , , vTokenPositions) = rageClearingHouse.getAccountInfo(rageAccountNo);

        _closeTokenPosition(vTokenPositions[0]);
    }

    function _isValidRebalance() internal view returns (bool isValid) {
        //TODO: make rebalance period variable
        if (_blockTimestamp() - lastRebalanceTS > 1 days || _isValidRebalanceRange()) isValid = true;
    }

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

    function _unrealizedBalance() internal pure returns (uint256) {
        // Returns the unrealized pnl which includes pnl from ranges (FP+Fee+RangeIL) and Yield from the yield protocol
        // This is divided by the asset value to arrive at the number of unrealized asset tokens
        // This might be away from the actual value
        return 0;
    }

    function _getTwapSqrtPriceX96() internal view returns (uint160 twapSqrtPriceX96) {
        twapSqrtPriceX96 = rageTradePool.vPool.twapSqrtPrice(rageTradePool.settings.twapDuration);
    }

    function totalAssets() public view override returns (uint256) {
        return asset.balanceOf(address(this)) + _stakedAssetBalance();
    }

    function _beforeShareTransfer() internal override {
        _rebalanceProfitAndCollateral();
    }

    function afterDeposit(uint256 amount) virtual internal override {
        _afterDepositYield(amount);
        _afterDepositRanges(totalAssets(), amount);
    }

    function beforeWithdraw(uint256 amount) virtual internal override {
        _beforeWithdrawRanges(totalAssets(), amount);
        _beforeWithdrawYield(amount);
    }

    function beforeBurn(uint256 amount) virtual internal override returns (uint256 updatedAmount) {
        return _beforeBurnRanges(totalAssets(), amount);
    }

    function _blockTimestamp() internal view returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp;
    }

    /*
        YIELD STRATEGY
    */

    function _stake(uint256 amount) internal virtual;

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

    function _rebalanceRanges(IClearingHouse.VTokenPositionView memory vTokenPosition, int256 vaultMarketValue)
        internal
        virtual;

    function _closeTokenPosition(IClearingHouse.VTokenPositionView memory vTokenPosition) internal virtual;

    function _afterDepositRanges(uint256 amountAfterDeposit, uint256 amountDeposited) internal virtual;

    function _beforeBurnRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn)
        internal
        virtual
        returns (uint256 updatedAmountWithdrawn);

    function _beforeWithdrawRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn) internal virtual;

    function _isValidRebalanceRange() internal view virtual returns (bool isValid);
}
