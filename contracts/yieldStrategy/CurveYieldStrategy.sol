// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';

import { BaseVault } from '../base/BaseVault.sol';
import { EightyTwentyRangeStrategyVault } from '../rangeStrategy/EightyTwentyRangeStrategyVault.sol';

import { ICurveGauge } from '../interfaces/curve/ICurveGauge.sol';
import { ILPPriceGetter } from '../interfaces/curve/ILPPriceGetter.sol';
import { ICurveStableSwap } from '../interfaces/curve/ICurveStableSwap.sol';

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { AggregatorV3Interface } from '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

import {console} from 'hardhat/console.sol';

contract CurveYieldStrategy is EightyTwentyRangeStrategyVault {
    using FullMath for uint256;

    error CYS_INVALID_FEES();
    error CYS_NEGATIVE_CRV_PRICE();

    IERC20 public usdt;
    IERC20 public weth;
    IERC20 public usdc;
    IERC20 public crvToken;

    ICurveGauge public gauge;
    ISwapRouter public uniV3Router;
    ILPPriceGetter public lpPriceHolder;
    ICurveStableSwap public triCryptoPool;

    AggregatorV3Interface public crvOracle;

    uint256 crvSwapSlippageTolerance; // in bps, 10**4
    uint256 notionalCrvHarvestThreshold;

    /* solhint-enable const-name-snakecase */

    uint256 public constant MAX_BPS = 10_000;
    uint256 public FEE = 1000;

    function initialize(CurveYieldStrategyInitParams memory curveYieldStrategyInitParams) external initializer {
        __CurveYieldStrategy_init(curveYieldStrategyInitParams);
    }

    struct CurveYieldStrategyInitParams {
        EightyTwentyRangeStrategyVaultInitParams eightyTwentyRangeStrategyVaultInitParams;
        IERC20 usdt;
        IERC20 usdc;
        IERC20 weth;
        IERC20 crvToken;
        ICurveGauge gauge;
        ISwapRouter uniV3Router;
        ILPPriceGetter lpPriceHolder;
        ICurveStableSwap tricryptoPool;
    }

    // solhint-disable-next-line func-name-mixedcase
    function __CurveYieldStrategy_init(CurveYieldStrategyInitParams memory params) internal onlyInitializing {
        __EightyTwentyRangeStrategyVault_init(params.eightyTwentyRangeStrategyVaultInitParams);
        usdt = params.usdt;
        usdc = params.usdc;
        weth = params.weth;
        gauge = params.gauge;
        crvToken = params.crvToken;
        uniV3Router = params.uniV3Router;
        triCryptoPool = params.tricryptoPool;
        lpPriceHolder = params.lpPriceHolder;
    }

    function setCrvOracle(AggregatorV3Interface _crvOracle) external onlyOwner {
        crvOracle = _crvOracle;
    }

    function setCrvSwapSlippageTolerance(uint256 _slippageTolerance) external onlyOwner {
        crvSwapSlippageTolerance = _slippageTolerance;
    }

    function setNotionalCrvHarvestThreshold(uint256 _notionalCrvHarvestThreshold) external onlyOwner {
        notionalCrvHarvestThreshold = _notionalCrvHarvestThreshold;
    }

    function grantAllowances() public override onlyOwner {
        _grantBaseAllowances();
        usdt.approve(address(triCryptoPool), type(uint256).max);
        crvToken.approve(address(uniV3Router), type(uint256).max);
        asset.approve(address(triCryptoPool), type(uint256).max);
    }

    function changeFee(uint256 bps) external onlyOwner {
        if (bps > MAX_BPS) revert CYS_INVALID_FEES();
        FEE = bps;
    }

    function withdrawFees() external onlyOwner {
        uint256 bal = crvToken.balanceOf(address(this));
        crvToken.transfer(owner(), bal);
    }

    function _getCrvPrice() internal view returns (uint256) {
        (, int256 answer, , , ) = crvOracle.latestRoundData();
        if (answer < 0) revert CYS_NEGATIVE_CRV_PRICE();
        return (uint256(answer));
    }

    function _afterDepositYield(uint256 amount) internal override {
        _stake(amount);
    }

    function _beforeWithdrawYield(uint256 amount) internal override {
        gauge.withdraw(amount);
        _harvestFees();
    }

    function _convertSettlementTokenToAsset(uint256 amount) internal override {
        usdc.approve(address(uniV3Router), amount);
        bytes memory path = abi.encodePacked(usdc, uint24(500), usdt);

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            amountIn: amount,
            amountOutMinimum: 0,
            recipient: address(this),
            deadline: _blockTimestamp()
        });

        uint256 usdtOut = uniV3Router.exactInput(params);

        // USDT, WBTC, WETH
        usdt.approve(address(triCryptoPool), usdtOut);
        uint256[3] memory amounts = [usdtOut, uint256(0), uint256(0)];
        triCryptoPool.add_liquidity(amounts, 0);

        _stake(asset.balanceOf(address(this)));
    }

    function _harvestFees() internal override {
        uint256 claimable = gauge.claimable_reward(address(this), address(crvToken));

        if (claimable > notionalCrvHarvestThreshold) {
            uint256 afterDeductions = claimable - ((claimable * FEE) / MAX_BPS);

            gauge.claim_rewards(address(this));

            crvToken.approve(address(uniV3Router), afterDeductions);

            bytes memory path = abi.encodePacked(
                address(crvToken),
                uint24(3000),
                address(weth),
                uint24(500),
                address(usdt)
            );

            // 1 CRV (scaled 18 decimals) = x$ (scaled to 8 decimals)
            uint256 minOut = (_getCrvPrice() * afterDeductions * crvSwapSlippageTolerance) / MAX_BPS / 10**8;

            ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
                path: path,
                amountIn: afterDeductions,
                amountOutMinimum: minOut,
                recipient: address(this),
                deadline: _blockTimestamp()
            });

            uint256 usdtOut = uniV3Router.exactInput(params);

            usdt.approve(address(triCryptoPool), usdtOut);
            uint256[3] memory amounts = [usdtOut, uint256(0), uint256(0)];
            triCryptoPool.add_liquidity(amounts, 0);

            _stake(asset.balanceOf(address(this)));
        }
    }

    function _stake(uint256 amount) internal override {
        asset.approve(address(gauge), amount);
        gauge.deposit(amount);
    }

    function _stakedAssetBalance() internal view override returns (uint256) {
        return gauge.balanceOf(address(this));
    }

    function _convertAssetToSettlementToken(uint256 amount) internal override returns (uint256 usdcAmount) {
        uint256 pricePerLP = lpPriceHolder.lp_price();
        uint256 lpToWithdraw = ((amount * (10**12)) * (10**18)) / pricePerLP;

        gauge.withdraw(lpToWithdraw);
        triCryptoPool.remove_liquidity_one_coin(lpToWithdraw, 0, 0);
        usdt.approve(address(uniV3Router), amusdt.balanceOf(address(this))ount);

        bytes memory path = abi.encodePacked(usdt, uint24(500), usdc);

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            amountIn: usdt.balanceOf(address(this)),
            amountOutMinimum: 0,
            recipient: address(this),
            deadline: _blockTimestamp()
        });

        usdcAmount = uniV3Router.exactInput(params);

        return usdcAmount;
    }

    function getMarketValue(uint256 amount) public view override returns (uint256 marketValue) {
        marketValue = amount.mulDiv(getPriceX128(), FixedPoint128.Q128);
    }

    function getPriceX128() public view override returns (uint256 priceX128) {
        uint256 pricePerLP = lpPriceHolder.lp_price();
        return pricePerLP.mulDiv(FixedPoint128.Q128, 10**30); // 10**6 / (10**18*10**18)
    }
}
