// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

/* solhint-disable */

import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';

import { BaseVault } from '../base/BaseVault.sol';

contract BaseVaultTest is BaseVault {
    uint64 blockTimestamp_ = uint64(block.timestamp);

    constructor(
        IERC20Metadata token,
        address rageClearingHouse,
        address clearingHouseLens
    ) initializer {
        __BaseVault_init(
            BaseVaultInitParams({
                rageErc4626InitParams: RageERC4626InitParams({ asset: token, name: 'name', symbol: 'symbol' }),
                ethPoolId: 0,
                clearingHouseLens: clearingHouseLens,
                rageClearingHouse: rageClearingHouse,
                rageCollateralToken: address(token),
                rageSettlementToken: address(token)
            })
        );
    }

    function isValidRebalanceTime() public view returns (bool) {
        return _isValidRebalanceTime();
    }

    function rebalance() public override onlyKeeper {
        if (!isValidRebalance(0)) {
            revert BV_InvalidRebalance();
        }

        // Post rebalance
        lastRebalanceTS = uint64(_blockTimestamp());
    }

    function _blockTimestamp() internal view override returns (uint256) {
        return blockTimestamp_;
    }

    function setBlockTimestamp(uint64 bt) public {
        blockTimestamp_ = bt;
    }

    function _stake(uint256 amount) internal virtual override {}

    function _harvestFees() internal virtual override {}

    function getPriceX128() public view virtual override returns (uint256 priceX128) {}

    function getMarketValue(uint256 amount) public view virtual override returns (uint256 marketValue) {}

    function _convertAssetToSettlementToken(uint256 amount) internal virtual override returns (uint256 usdcAmount) {}

    function _convertSettlementTokenToAsset(uint256 amount) internal virtual override {}

    function _stakedAssetBalance() internal view virtual override returns (uint256) {}

    function _afterDepositYield(uint256 amount) internal virtual override {}

    function _beforeWithdrawYield(uint256 amount) internal virtual override {}

    /*
        RANGE STRATEGY
    */

    function _rebalanceRanges(int256 netTraderPosition, int256 vaultMarketValue) internal virtual override {}

    function _closeTokenPositionOnReset(int256 netTraderPosition) internal virtual override {}

    function _afterDepositRanges(uint256 amountAfterDeposit, uint256 amountDeposited) internal virtual override {}

    function _beforeWithdrawClosePositionRanges(int256 tokensToTrade) internal virtual override {}

    function _beforeWithdrawRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn) internal virtual override {}

    function _isValidRebalanceRange(int256 vaultMarketValue) internal view virtual override returns (bool isValid) {}
}
