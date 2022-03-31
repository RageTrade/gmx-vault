// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { IVToken } from '@ragetrade/core/contracts/interfaces/IVToken.sol';

import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';

import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { IUniswapV2Pair } from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import { IUniswapV2Router02 } from '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

import { BaseSushiVault, SushiParams } from '../yieldStrategy/BaseSushiVault.sol';
import { BaseRangeStrategyVault } from '../rangeStrategy/BaseRangeStrategyVault.sol';
import { IMiniChefV2 } from '../interfaces/sushi/IMiniChefV2.sol';
import { Pricing } from '../libraries/Pricing.sol';

contract VaultTest is BaseSushiVault {
    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        uint32 _ethPoolId
    ) BaseSushiVault(_asset, _name, _symbol, _ethPoolId) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function testLiquidityChangeParams(IClearingHouse.VTokenPositionView memory vTokenPosition, int256 vaultMarketValue)
        external
        view
        returns (IClearingHouse.LiquidityChangeParams[4] memory liquidityChangeParamList)
    {
        return getLiquidityChangeParams(vTokenPosition, vaultMarketValue);
    }

    function testSettleCollateral(int256 vaultMarketValueDiff) external {
        _settleCollateral(vaultMarketValueDiff);
    }

    function testDepositBase(uint256 amount) external {
        _depositBase(amount);
    }

    function testWithdrawBase(uint256 amount) external {
        _withdrawBase(amount);
    }
}
