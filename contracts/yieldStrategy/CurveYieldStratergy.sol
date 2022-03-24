// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import { EightyTwentyRangeStrategyVault } from '../rangeStrategy/EightyTwentyRangeStrategyVault.sol';

import { ICurveGauge } from '../interfaces/curve/ICurveGauge.sol';
import { ILPPriceGetter } from '../interfaces/curve/ILPPriceGetter.sol';
import { ICurveStableSwap } from '../interfaces/curve/ICurveStableSwap.sol';

import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';

import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { IUniswapV2Router02 } from '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import { IUniswapV2Pair } from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

import { BaseRangeStrategyVault } from '../rangeStrategy/BaseRangeStrategyVault.sol';
import { BaseVault } from '../base/BaseVault.sol';
import { IMiniChefV2 } from '../interfaces/sushi/IMiniChefV2.sol';
import { Pricing } from '../libraries/Pricing.sol';

// TODO: remove abstract after fixing constructor
abstract contract CurveYieldStratergy is EightyTwentyRangeStrategyVault {
    address public usdc;
    address public crvToken;

    address public triCryptoPool;
    address public lpPriceHolder;

    address public uniV3Router;

    address public constant lpToken = address(0);
    // TODO: replace, after removing constructor from base
    uint256 public constant MAX_BPS = 10_000;
    uint256 public constant FEE = 1000;

    function __CurveYieldStratergy__init(
        address _usdc,
        address _tricryptoPool,
        address _crvToken,
        address _lpPriceHolder,
        address _uniV3Router
    ) internal onlyInitializing {
        usdc = _usdc;
        crvToken = _crvToken;
        triCryptoPool = _tricryptoPool;
        lpPriceHolder = _lpPriceHolder;
        uniV3Router = _uniV3Router;

        grantAllowances();
    }

    function initialize(
        address _owner,
        address _rageClearingHouse,
        address _rageCollateralToken,
        address _rageBaseToken,
        address _usdc,
        address _tricryptoPool,
        address _crvToken,
        address _lpPriceHolder,
        address _uniV3Router
    ) external initializer {
        __BaseVault_init(_owner, _rageClearingHouse, _rageCollateralToken, _rageBaseToken);
        __CurveYieldStratergy__init(_usdc, _tricryptoPool, _crvToken, _lpPriceHolder, _uniV3Router);
    }

    function grantAllowances() public override {
        _grantBaseAllowances();
        IERC20(lpToken).approve(triCryptoPool, type(uint256).max);
        IERC20(usdc).approve(triCryptoPool, type(uint256).max);
        IERC20(crvToken).approve(uniV3Router, type(uint256).max);
    }

    function _afterDepositYield(uint256 amount) internal override {}

    function _beforeWithdrawYield(uint256 amount) internal override {}

    function _depositBase(uint256 amount) internal override {}

    function _harvestFees() internal override {}

    function _stake() internal override {}

    function _stakedAssetBalance() internal view override returns (uint256) {}

    function _withdrawBase(uint256 amount) internal override {}

    function getMarketValue(uint256 amount) public view override returns (uint256 marketValue) {}

    function getPriceX128() public view override returns (uint256 priceX128) {}
}
