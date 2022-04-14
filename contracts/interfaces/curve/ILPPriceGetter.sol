// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.9;

/* solhint-disable func-name-mixedcase */

interface ILPPriceGetter {
    function lp_price() external view returns (uint256);
}
