// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { IClearingHouseStructures } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseStructures.sol';

import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';

import { BaseVault } from '../base/BaseVault.sol';
import { EightyTwentyRangeStrategyVault } from '../rangeStrategy/EightyTwentyRangeStrategyVault.sol';

contract EightyTwentyRangeStrategyVaultTest is EightyTwentyRangeStrategyVault {
    /* solhint-disable no-empty-blocks */
    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        uint32 _ethPoolId
    ) BaseVault(_asset, _name, _symbol, _ethPoolId) {}

    function _stake() internal virtual override {}

    function _harvestFees() internal virtual override {}

    function getPriceX128() public view virtual override returns (uint256 priceX128) {}

    function getMarketValue(uint256 amount) public view virtual override returns (uint256 marketValue) {}

    // To convert yield token into USDC to cover loss on rage trade
    function _withdrawBase(uint256 amount) internal virtual override {}

    // To deposit the USDC profit made from rage trade into yield protocol
    function _depositBase(uint256 amount) internal virtual override {}

    function _stakedAssetBalance() internal view virtual override returns (uint256) {}

    function _afterDepositYield(uint256 amount) internal virtual override {}

    function _beforeWithdrawYield(uint256 amount) internal virtual override {}

    /* solhint-enable no-empty-blocks */

    function getLiquidityChangeParamsOnRebalance(int256 vaultMarketValue)
        external
        returns (IClearingHouseStructures.LiquidityChangeParams[2] memory liquidityChangeParamList)
    {
        return _getLiquidityChangeParamsOnRebalance(vaultMarketValue);
    }
}
