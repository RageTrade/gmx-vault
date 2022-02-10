// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;
import { BaseVault } from '../base/BaseVault.sol';

import { BaseRangeStrategyVault } from '../rangeStrategy/BaseRangeStrategyVault.sol';
import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';

contract BaseSushiVault is BaseRangeStrategyVault {
    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        address _vWethAddress
    ) BaseVault(_asset, _name, _symbol, _vWethAddress) {}

    /*
        YEILD STRATEGY
    */

    function depositTokens() external override {}

    function withdrawTokens() external override {}

    function harvestFees() external override {}

    function getPrice() external override {}

    function getMarketValue(uint256 balance) public view override returns (uint256 marketValue) {}

    //To convert yeild token into USDC to cover loss on rage trade
    function withdrawUsdc(uint256 balance) internal override returns (uint256 marketValue) {}

    //To deposit the USDC profit made from rage trade into yeild protocol
    function depositUsdc(uint256 balance) internal override returns (uint256 marketValue) {}

    //To rebalance multiple collateral token
    function rebalanceCollateral() internal override {}
}
