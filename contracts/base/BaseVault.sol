// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;
import { IBaseVault } from '../interfaces/IBaseVault.sol';
import { IBaseYieldStrategy } from '../interfaces/IBaseYieldStrategy.sol';

import { RageERC4626 } from './RageERC4626.sol';
import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import { IClearingHouse, IVToken } from '@ragetrade/contracts/contracts/interfaces/IClearingHouse.sol';

import { SafeCast } from '../libraries/SafeCast.sol';
import { CollateralToken } from '../CollateralToken.sol';
import { RTokenLib } from '@ragetrade/contracts/contracts/libraries/RTokenLib.sol';
import { SignedMath } from '@ragetrade/contracts/contracts/libraries/SignedMath.sol';

import { SignedFullMath } from '@ragetrade/contracts/contracts/libraries/SignedFullMath.sol';

import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { console } from 'hardhat/console.sol';

abstract contract BaseVault is IBaseVault, RageERC4626, IBaseYieldStrategy, OwnableUpgradeable {
    using SafeCast for uint256;
    using SafeCast for int256;
    using SignedFullMath for int256;
    using SignedMath for int256;

    //TODO: Make relevant things immutable
    IClearingHouse public rageClearingHouse;
    uint256 public rageAccountNo;
    CollateralToken public rageCollateralToken;
    address public immutable VWETH_ADDRESS;
    uint32 public immutable VWETH_TRUNCATED_ADDRESS;
    IERC20Metadata public rageBaseToken;

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        address _vWethAddress
    ) RageERC4626(_asset, _name, _symbol) {
        VWETH_ADDRESS = _vWethAddress;
        VWETH_TRUNCATED_ADDRESS = RTokenLib.truncate(_vWethAddress);
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
        rageCollateralToken = CollateralToken(_rageCollateralToken);
        rageBaseToken = IERC20Metadata(_rageBaseToken);
        //Give rageClearingHouse full allowance of rageCollateralToken and usdc
    }

    function grantAllowances() external virtual {
        _grantBaseAllowances();
    }

    function _grantBaseAllowances() internal {
        rageCollateralToken.approve(address(rageClearingHouse), (1 << 256) - 1);
        rageBaseToken.approve(address(rageClearingHouse), (1 << 256) - 1);
    }

    function getVaultMarketValue() public view returns (int256 vaultMarketValue) {
        vaultMarketValue = rageClearingHouse.getAccountNetProfit(rageAccountNo);
        vaultMarketValue += (getMarketValue(asset.balanceOf(address(this)))).toInt256();
    }

    function settleProfitAndCollateral(IClearingHouse.DepositTokenView[] memory deposits, int256 vaultMarketValue)
        internal
    {
        // Settle net profit made from ranges and deposit/withdraw profits in USDC
        int256 netProfit = rageClearingHouse.getAccountNetProfit(rageAccountNo);
        if (netProfit > 0) {
            //If net profit > 0 withdraw USDC and convert USDC into LP tokens
            rageClearingHouse.updateProfit(rageAccountNo, -1 * netProfit);
            depositBase(uint256(netProfit));
        } else if (netProfit < 0) {
            //If net profit > 0 convert LP tokens into USDC and deposit USDC to cover loss
            withdrawBase(uint256(-1 * netProfit));
            rageClearingHouse.updateProfit(rageAccountNo, -1 * netProfit);
        }

        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        int256 vaultMarketValueDiff;
        if (deposits.length > 0) {
            assert(deposits.length == 1);
            IClearingHouse.DepositTokenView memory stablecoinDeposit = deposits[0];
            assert(stablecoinDeposit.rTokenAddress == address(rageCollateralToken));
            vaultMarketValueDiff =
                vaultMarketValue -
                stablecoinDeposit.balance.toInt256().mulDiv(
                    10**rageBaseToken.decimals(),
                    10**rageCollateralToken.decimals()
                );
        } else {
            vaultMarketValueDiff = vaultMarketValue;
        }
        //Settlement basis market value difference
        settleCollateral(vaultMarketValueDiff);
    }

    function settleCollateral(int256 vaultMarketValueDiff) internal {
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
                RTokenLib.truncate(address(rageCollateralToken)),
                normalizedVaultMarketValueDiffAbs
            );
        } else if (normalizedVaultMarketValueDiff < 0) {
            // Withdraw rage trade deposits
            rageClearingHouse.removeMargin(
                rageAccountNo,
                RTokenLib.truncate(address(rageCollateralToken)),
                normalizedVaultMarketValueDiffAbs
            );
        }
    }

    function rebalance() public {
        //Rebalance ranges based on the parameters passed
        //TODO: Use multicall instead of directly executing txns with rageClearingHouse
        IClearingHouse.DepositTokenView[] memory deposits;
        IClearingHouse.VTokenPositionView[] memory vTokenPositions;
        //Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, , deposits, vTokenPositions) = rageClearingHouse.getAccountView(rageAccountNo);
        // (, uint256 virtualPriceX128) = rageClearingHouse.getTwapSqrtPricesForSetDuration(IVToken(VWETH_ADDRESS));
        int256 vaultMarketValue = getMarketValue(asset.balanceOf(address(this))).toInt256();

        _rebalanceProfitAndCollateral(deposits, vTokenPositions, vaultMarketValue);

        IClearingHouse.RageTradePool memory rageTradePool = rageClearingHouse.pools(IVToken(VWETH_ADDRESS));

        //Step-4 Find the ranges and amount of liquidity to put in each
        rebalanceRanges(vTokenPositions[0], rageTradePool, vaultMarketValue);

        //Step-5 Rebalance
    }

    function rebalanceProfitAndCollateral() public {
        //Rebalance collateral and dummy stable coins representing the collateral
        //Update protocol and management fee accumulated
        IClearingHouse.DepositTokenView[] memory deposits;
        IClearingHouse.VTokenPositionView[] memory vTokenPositions;

        //Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, , deposits, vTokenPositions) = rageClearingHouse.getAccountView(rageAccountNo);
        //#Token position = 0 or (1 and token should be VWETH)
        int256 vaultMarketValue = getMarketValue(asset.balanceOf(address(this))).toInt256();

        _rebalanceProfitAndCollateral(deposits, vTokenPositions, vaultMarketValue);
    }

    function _rebalanceProfitAndCollateral(
        IClearingHouse.DepositTokenView[] memory deposits,
        IClearingHouse.VTokenPositionView[] memory vTokenPositions,
        int256 vaultMarketValue
    ) internal {
        assert(
            vTokenPositions.length == 0 ||
                (vTokenPositions.length == 1 && vTokenPositions[0].vTokenAddress == VWETH_ADDRESS)
        );
        //TODO: Uncomment stake and harvest fees
        //Harvest the rewards earned (Should be harvested before calculating vault market value)
        // harvestFees();

        settleProfitAndCollateral(deposits, vaultMarketValue);

        //stake the remaining LP tokens
        // stake();
    }

    function unrealizedBalance() internal view returns (uint256) {
        //Returns the unrealized pnl which includes pnl from ranges (FP+Fee+RangeIL) and Yield from the yield protocol
        //This is divided by the asset value to arrive at the number of unrealized asset tokens
        //This might be away from the actual value
    }

    function totalAssets() public view override returns (uint256) {
        return asset.balanceOf(address(this)) + stakedAssetBalance();
    }

    function beforeShareTransfer() internal override {
        rebalanceProfitAndCollateral();
    }

    function afterDeposit(uint256 amount) internal override {
        afterDepositRanges(amount);
        afterDepositYield(amount);
    }

    function beforeWithdraw(uint256 amount) internal override {
        beforeWithdrawRanges(amount);
        beforeWithdrawYield(amount);
    }

    /*
        YIELD STRATEGY
    */

    function stake() internal virtual;

    function harvestFees() internal virtual;

    function getPriceX128() public view virtual returns (uint256 priceX128);

    function getMarketValue(uint256 balance) public view virtual returns (uint256 marketValue);

    //To convert yield token into USDC to cover loss on rage trade
    function withdrawBase(uint256 balance) internal virtual;

    //To deposit the USDC profit made from rage trade into yield protocol
    function depositBase(uint256 amount) internal virtual;

    function stakedAssetBalance() internal view virtual returns (uint256);

    function afterDepositYield(uint256 amount) internal virtual;

    function beforeWithdrawYield(uint256 amount) internal virtual;

    /*
        RANGE STRATEGY
    */

    function rebalanceRanges(
        IClearingHouse.VTokenPositionView memory vTokenPosition,
        IClearingHouse.RageTradePool memory rageTradePool,
        int256 vaultMarketValue
    ) internal virtual;

    function afterDepositRanges(uint256 amount) internal virtual;

    function beforeWithdrawRanges(uint256 amount) internal virtual;
}
