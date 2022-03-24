// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

interface ILPPriceGetter {
    function lp_price() external view returns (uint256);
}
