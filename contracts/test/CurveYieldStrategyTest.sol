// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';
import { RageERC4626 } from '../base/RageERC4626.sol';

import { CurveYieldStrategy } from '../yieldStrategy/CurveYieldStrategy.sol';

contract CurveYieldStrategyTest is CurveYieldStrategy {
    // solhint-disable-next-line no-empty-blocks
    constructor(ERC20 _lpToken) CurveYieldStrategy(_lpToken, '', '', 0) {}

    function depositUsdc(uint256 amount) external {
        super._convertSettlementTokenToAsset(amount);
    }

    function withdrawUsdc(uint256 amount) external {
        super._convertAssetToSettlementToken(amount);
    }

    function stake(uint256 amount) external {
        super._stake(amount);
    }

    function harvestFees() external {
        super._harvestFees();
    }

    function _afterDepositRanges(uint256 amountAfterDeposit, uint256 amountDeposited) internal override {}

    function beforeWithdrawClosePosition(uint256 amount) internal override returns (uint256 updatedAmount) {
        updatedAmount = amount;
    }

    function _beforeShareAllocation() internal override {
        _harvestFees();
        _stake(asset.balanceOf(address(this)));
    }

    function _beforeWithdrawRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn) internal override {}
}
