// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.9;

/* solhint-disable func-name-mixedcase */
/* solhint-disable var-name-mixedcase */

interface IGaugeFactory {
    function mint(address gauge) external;

    function get_gauge_from_lp_token(address lpToken) external view returns (address);
}
