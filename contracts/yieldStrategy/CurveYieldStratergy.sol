// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import { EightyTwentyRangeStrategyVault } from '../rangeStrategy/EightyTwentyRangeStrategyVault.sol';

import { ICurveGauge } from '../interfaces/curve/ICurveGauge.sol';
import { ILPPriceGetter } from '../interfaces/curve/ILPPriceGetter.sol';
import { ICurveStableSwap } from '../interfaces/curve/ICurveStableSwap.sol';

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

// TODO: remove abstract after fixing constructor
abstract contract CurveYieldStratergy is EightyTwentyRangeStrategyVault {
    IERC20 public usdt;
    IERC20 public crvToken;

    ICurveGauge public gauge;
    ISwapRouter public uniV3Router;
    ILPPriceGetter public lpPriceHolder;
    ICurveStableSwap public triCryptoPool;

    // TODO: replace, after removing constructor from base
    IERC20 public constant weth = IERC20(address(0));
    IERC20 public constant usdc = IERC20(address(0));
    IERC20 public constant lpToken = IERC20(address(0));

    uint256 public constant MAX_BPS = 10_000;
    uint256 public constant FEE = 1000;

    function __CurveYieldStratergy__init(
        IERC20 _usdc,
        IERC20 _crvToken,
        ICurveGauge _gauge,
        ISwapRouter _uniV3Router,
        ILPPriceGetter _lpPriceHolder,
        ICurveStableSwap _tricryptoPool
    ) internal onlyInitializing {
        usdt = _usdc;
        gauge = _gauge;
        crvToken = _crvToken;
        uniV3Router = _uniV3Router;
        triCryptoPool = _tricryptoPool;
        lpPriceHolder = _lpPriceHolder;

        grantAllowances();
    }

    function initialize(
        address _owner,
        address _rageClearingHouse,
        address _rageCollateralToken,
        address _rageBaseToken,
        IERC20 _usdc,
        IERC20 _crvToken,
        ICurveGauge _gauge,
        ISwapRouter _uniV3Router,
        ILPPriceGetter _lpPriceHolder,
        ICurveStableSwap _tricryptoPool
    ) external initializer {
        __BaseVault_init(_owner, _rageClearingHouse, _rageCollateralToken, _rageBaseToken);
        __CurveYieldStratergy__init(_usdc, _crvToken, _gauge, _uniV3Router, _lpPriceHolder, _tricryptoPool);
    }

    function grantAllowances() public override {
        _grantBaseAllowances();
        lpToken.approve(address(gauge), type(uint256).max);
        usdt.approve(address(triCryptoPool), type(uint256).max);
        crvToken.approve(address(uniV3Router), type(uint256).max);
        lpToken.approve(address(triCryptoPool), type(uint256).max);
    }

    function _afterDepositYield(uint256 amount) internal override {
        _stake(amount);
    }

    function _beforeWithdrawYield(uint256 amount) internal override {}

    function _depositBase(uint256 amount) internal override {
        usdt.approve(address(uniV3Router), amount);
        bytes memory path = abi.encodePacked(usdt, uint256(500), usdc);

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            amountIn: amount,
            amountOutMinimum: 0,
            recipient: address(this),
            deadline: block.timestamp
        });

        uint256 usdtOut = uniV3Router.exactInput(params);

        // USDT, WBTC, WETH
        uint256[3] memory amounts = [usdtOut, uint256(0), uint256(0)];
        triCryptoPool.add_liquidity(amounts, 0);

        _stake(lpToken.balanceOf(address(this)));
    }

    function _harvestFees() internal override {
        uint256 claimable = gauge.claimable_reward(address(this));
        gauge.claim_rewards(address(this));

        bytes memory path = abi.encodePacked(weth, uint256(500), usdt, uint256(3000), address(crvToken));

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            amountIn: claimable,
            amountOutMinimum: 0,
            recipient: address(this),
            deadline: block.timestamp
        });

        uint256 amountOut = uniV3Router.exactInput(params);
        _stake(amountOut);
    }

    function _stake(uint256 amount) internal override {
        gauge.deposit(amount);
    }

    function _stakedAssetBalance() internal view override returns (uint256) {
        uint256 staked = gauge.balanceOf(address(this)) / 10**18;
        uint256 pricePerLP = lpPriceHolder.lp_price();

        return staked * pricePerLP;
    }

    // unstake some LP -> usdc
    // fix: division rounding
    function _withdrawBase(uint256 amount) internal override {
        uint256 pricePerLP = lpPriceHolder.lp_price();
        uint256 lpToWithdraw = amount / pricePerLP;

        triCryptoPool.remove_liquidity_one_coin(lpToWithdraw, 0, 0);
        usdt.approve(address(uniV3Router), amount);

        bytes memory path = abi.encodePacked(usdc, uint256(500), usdt);

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            amountIn: amount,
            amountOutMinimum: 0,
            recipient: address(this),
            deadline: block.timestamp
        });

        uniV3Router.exactInput(params);
    }

    function getMarketValue(uint256 amount) public view override returns (uint256 marketValue) {}

    function getPriceX128() public view override returns (uint256 priceX128) {}
}
