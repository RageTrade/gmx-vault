// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

/* solhint-disable */

import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { RageERC4626 } from '../base/RageERC4626.sol';

import { CurveYieldStrategy } from '../yieldStrategy/CurveYieldStrategy.sol';

import { ICurveGauge } from '../interfaces/curve/ICurveGauge.sol';
import { ILPPriceGetter } from '../interfaces/curve/ILPPriceGetter.sol';
import { ICurveStableSwap } from '../interfaces/curve/ICurveStableSwap.sol';

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

contract CurveYieldStrategyTest is CurveYieldStrategy {
    constructor(CurveYieldStrategyInitParams memory params) initializer {
        __CurveYieldStrategy_init(params);
    }

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

    function beforeWithdrawClosePosition(uint256 amount) internal override {}

    function _beforeShareAllocation() internal override {
        _harvestFees();
        _stake(asset.balanceOf(address(this)));
    }

    function _beforeWithdrawRanges(uint256 amountBeforeWithdraw, uint256 amountWithdrawn) internal override {}
}
