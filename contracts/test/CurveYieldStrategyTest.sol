// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';

import { CurveYieldStrategy } from '../yieldStrategy/CurveYieldStrategy.sol';

contract CurveYieldStrategyTest is CurveYieldStrategy {
    // solhint-disable-next-line no-empty-blocks
    constructor(ERC20 _lpToken) CurveYieldStrategy(_lpToken) {}
}
