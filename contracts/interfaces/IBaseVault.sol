// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.9;

import { ISwapSimulator } from './ISwapSimulator.sol';
import { IUniswapV3Pool } from '@uniswap/v3-core-0.8-support/contracts/interfaces/IUniswapV3Pool.sol';

interface IBaseVault {
    function rebalance() external;

    function closeTokenPosition() external;

    function ethPoolId() external view returns (uint32);

    function depositCap() external view returns (uint256);

    function rageAccountNo() external view returns (uint256);

    function rageVPool() external view returns (IUniswapV3Pool);

    function rageClearingHouse() external view returns (address);

    function swapSimulator() external view returns (ISwapSimulator);

    function minNotionalPositionToCloseThreshold() external view returns (uint64);

    function closePositionSlippageSqrtToleranceBps() external view returns (uint16);
}
