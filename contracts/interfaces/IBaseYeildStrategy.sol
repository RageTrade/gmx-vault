// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IBaseYeildStrategy {
    function getMarketValue(uint256 balance) external view returns (uint256 marketValue);

    // Converts tokens into yeild generating tokens
    function depositTokens() external;

    // Converts yeild generating tokens into tokens
    function withdrawTokens() external;

    // Harvests the token rewards and converts them into yeild tokens if needed
    function harvestFees() external;

    //Returns the price of yeild token
    function getPriceX128() external view returns (uint256 priceX128);
}
