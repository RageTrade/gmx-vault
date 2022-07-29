// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC4626 } from 'contracts/interfaces/IERC4626.sol';

interface IGlpStakingManager is IERC4626 {
    function depositToken(address token, uint256 amount) external returns (uint256 shares);
}
