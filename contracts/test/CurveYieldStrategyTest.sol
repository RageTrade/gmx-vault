// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';
import { RageERC4626 } from '../base/RageERC4626.sol';

import { CurveYieldStrategy } from '../yieldStrategy/CurveYieldStrategy.sol';

import { console } from 'hardhat/console.sol';

contract CurveYieldStrategyTest is CurveYieldStrategy {
    // solhint-disable-next-line no-empty-blocks
    constructor(ERC20 _lpToken) CurveYieldStrategy(_lpToken) {}

    function depositUsdc(uint256 amount) external {
        super._depositBase(amount);
    }

    function withdrawUsdc(uint256 amount) external {
        super._withdrawBase(amount);
    }

    function stake(uint256 amount) external {
        super._stake(amount);
    }

    function harvestFees() external {
        super._harvestFees();
    }
}