// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol';
import { AggregatorV3Interface } from '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/* solhint-disable */

contract StableSwapMock {
    error NEGATIVE_PRICE();

    uint256 constant FEES = 30;
    uint256 constant MAX_BPS = 10_000;

    address[3] public tokens;
    address[3] public oracles;
    uint256[3] public decimals;
    uint256[3] public quantities;

    address public lpToken;

    constructor(
        address _lpToken,
        address[3] memory _tokens,
        address[3] memory _oracles
    ) {
        tokens = _tokens;
        oracles = _oracles;
        decimals = [6, 8, 18];

        lpToken = _lpToken;
    }

    function _getPrice(address oracle) internal view returns (uint256) {
        (, int256 answer, , , ) = AggregatorV3Interface(oracle).latestRoundData();
        if (answer < 0) revert NEGATIVE_PRICE();
        return (uint256(answer));
    }

    function add_liquidity(
        uint256[3] calldata amounts,
        uint256 /** min_mint_amount */
    ) external {
        require(amounts.length == tokens.length, 'LENGTH_MISMATCH');
        uint256 len = tokens.length;

        uint256 slippage;
        uint256 lpTokenToMint;
        uint256 nonZeroQuantities;

        for (uint256 i; i < len; ++i) {
            if (amounts[i] > 0) {
                nonZeroQuantities++;
                IERC20(tokens[i]).transferFrom(msg.sender, address(this), amounts[i]);
                quantities[i] += amounts[i];

                uint256 normalized = amounts[i] * (10**(18 - decimals[i]));
                uint256 quantity = _getPrice(oracles[i]) * normalized;

                lpTokenToMint += (quantity / 3);

                if (amounts[i] > quantities[i]) slippage += amounts[i] / (amounts[i] - quantities[i]);
                if (quantities[i] > amounts[i]) slippage += quantities[i] / (quantities[i] - amounts[i]);
            }
        }

        uint256 fees = ((3 - nonZeroQuantities) * 10**18 * FEES) / MAX_BPS;
        lpTokenToMint = lpTokenToMint - fees - slippage;
        IMintable(lpToken).mint(msg.sender, lpTokenToMint);
    }

    function exchange(
        int128 from,
        int128 to,
        uint256 _from_amount,
        uint256 _min_to_amount
    ) external {
        IERC20(tokens[uint256(from)]).transferFrom(msg.sender, address(this), _from_amount);
        uint256 input = _getPrice(oracles[]);
    }

    function lp_price() external view returns (uint256) {

    }
}
