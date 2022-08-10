// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.9;

import { IMMVault } from './IMMVault.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
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

import { ISwapSimulator } from '../interfaces/ISwapSimulator.sol';

import { ClearingHouseLens } from '@ragetrade/core/contracts/lens/ClearingHouseLens.sol';

import { SafeCast } from '../libraries/SafeCast.sol';
import { Logic } from '../libraries/Logic.sol';

contract MMVault is IMMVault, OwnableUpgradeable {
    using AddressHelper for address;
    using ClearingHouseExtsload for IClearingHouse;
    using SafeCast for uint256;
    using SignedMath for int256;
    using SignedFullMath for int256;

    address marketMaker;

    uint32 public ethPoolId;
    uint32 internal collateralId;
    uint64 public lastRebalanceTS;

    uint256 public rageAccountNo;
    ClearingHouseLens internal lens;
    ISwapSimulator public swapSimulator;
    IClearingHouse public rageClearingHouse;
    IUniswapV3Pool public rageVPool;

    IERC20Metadata internal rageSettlementToken;
    CollateralToken internal rageCollateralToken;

    uint16 public rebalanceDeltaThresholdBps;
    uint32 public rebalanceTimeThreshold; // seconds

    struct MMVaultInitParams {
        uint32 ethPoolId;
        address marketMaker;
        address swapSimulator;
        address rageClearingHouse;
        address clearingHouseLens;
        address rageCollateralToken;
        address rageSettlementToken;
    }

    function initialize(MMVaultInitParams calldata params) external initializer {
        __Ownable_init();
        __MMVault_init(params);
    }

    function __MMVault_init(MMVaultInitParams calldata params) internal onlyInitializing {
        marketMaker = params.marketMaker;
        ethPoolId = params.ethPoolId;
        lens = ClearingHouseLens(params.clearingHouseLens);
        swapSimulator = ISwapSimulator(params.swapSimulator);

        rageClearingHouse = IClearingHouse(params.rageClearingHouse);
        rageAccountNo = rageClearingHouse.createAccount();

        rageSettlementToken = IERC20Metadata(params.rageSettlementToken);
        rageCollateralToken = CollateralToken(params.rageCollateralToken);

        rageVPool = rageClearingHouse.getVPool(ethPoolId);
        collateralId = params.rageCollateralToken.truncate();

        rebalanceDeltaThresholdBps = 500; //5%
        rebalanceTimeThreshold = 1 days;
    }

    // Give rageClearingHouse full allowance of rageCollateralToken and usdc    }
    function updateMMParams() external {}

    function approveSwap() external {}

    function rebalance() external {
        if (!isValidRebalance()) {
            revert MM_InvalidRebalance();
        }
        // Rebalance ranges based on the parameters passed
        // Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, int256 vTokenPosition) = _rebalanceProfitAndCollateral();

        // Post rebalance
        lastRebalanceTS = uint64(_blockTimestamp());

        emit Logic.Rebalance();
    }

    /// @notice Rebalances the pnl on rage trade and converts profit into asset tokens and covers losses using asset tokens
    /// @notice Rebalances collateral based on the updated market value of vault assets
    function _rebalanceProfitAndCollateral() internal returns (uint256 collateralDeposited, int256 netTraderPosition) {
        // Rebalance collateral and dummy stable coins representing the collateral
        // Update protocol and management fee accumulated

        // Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, netTraderPosition, ) = lens.getAccountTokenPositionInfo(rageAccountNo, ethPoolId);
        (, int256 requiredMargin) = rageClearingHouse.getAccountMarketValueAndRequiredMargin(rageAccountNo, false);
        collateralDeposited = lens.getAccountCollateralBalance(rageAccountNo, collateralId);
        // #Token position = 0 or (1 and token should be VWETH)

        _settleProfitAndCollateral(collateralDeposited, requiredMargin);
    }

    /// @notice settles profit and collateral for the vault
    /// @param collateralDeposited The amount of rage collateral token deposited to rage core
    /// @param requiredMargin The required margin of the vault in USDC
    function _settleProfitAndCollateral(uint256 collateralDeposited, int256 requiredMargin) internal {
        // Settle net profit made from ranges and deposit/withdraw profits in USDC
        int256 netProfit = rageClearingHouse.getAccountNetProfit(rageAccountNo);
        int256 totalSettlementTokenBalance = netProfit + rageSettlementToken.balanceOf(address(this)).toInt256();

        //Transfer required settlement token balance
        int256 requiredSettlementTokenBalance = totalSettlementTokenBalance - requiredMargin;

        if (requiredSettlementTokenBalance > 0) {
            // If net profit > 0 withdraw USDC and convert USDC into LP tokens
            rageSettlementToken.transferFrom(_msgSender(), address(this), uint256(requiredSettlementTokenBalance));
            _settleProfit(netProfit);
        } else if (requiredSettlementTokenBalance < 0) {
            _settleProfit(netProfit);
            rageSettlementToken.transfer(_msgSender(), uint256(-1 * requiredSettlementTokenBalance));
        }

        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        int256 vaultMarketValueDiff;
        // assert(address(stablecoinDeposit.collateral) == address(rageCollateralToken));
        vaultMarketValueDiff =
            10 *
            requiredMargin -
            collateralDeposited.toInt256().mulDiv(
                10**rageSettlementToken.decimals(),
                10**rageCollateralToken.decimals()
            );
        // Settlement basis market value difference
        _settleCollateral(vaultMarketValueDiff);
    }

    function _settleCollateral(int256 vaultMarketValueDiff) internal {
        int256 normalizedVaultMarketValueDiff = vaultMarketValueDiff.mulDiv(
            10**rageCollateralToken.decimals(),
            10**rageSettlementToken.decimals()
        );
        uint256 normalizedVaultMarketValueDiffAbs = normalizedVaultMarketValueDiff.absUint();

        if (normalizedVaultMarketValueDiff > 0) {
            // Mint collateral coins and deposit into rage trade
            rageCollateralToken.mint(address(this), normalizedVaultMarketValueDiffAbs);
            rageClearingHouse.updateMargin(rageAccountNo, collateralId, int256(normalizedVaultMarketValueDiffAbs));
        } else if (normalizedVaultMarketValueDiff < 0) {
            // Withdraw rage trade deposits
            rageClearingHouse.updateMargin(rageAccountNo, collateralId, -int256(normalizedVaultMarketValueDiffAbs));
            rageCollateralToken.burn(normalizedVaultMarketValueDiffAbs);
        }
    }

    function _settleProfit(int256 netProfit) internal {
        rageClearingHouse.updateProfit(rageAccountNo, -1 * netProfit);
    }

    function isValidRebalance() public view returns (bool isValid) {
        if (lastRebalanceTS < _blockTimestamp() + rebalanceTimeThreshold) return true;
        else return false;
    }

    function _blockTimestamp() internal view returns (uint256) {
        return block.timestamp;
    }
}
