// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.9;

interface IBaseYieldStrategy {
    function getMarketValue(uint256 amount) external view returns (uint256 marketValue);

    // Returns the price of yield token
    function getPriceX128() external view returns (uint256 priceX128);
}
