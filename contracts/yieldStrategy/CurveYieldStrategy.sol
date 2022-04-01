// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';

import { BaseVault } from '../base/BaseVault.sol';
import { EightyTwentyRangeStrategyVault } from '../rangeStrategy/EightyTwentyRangeStrategyVault.sol';

import { ICurveGauge } from '../interfaces/curve/ICurveGauge.sol';
import { ILPPriceGetter } from '../interfaces/curve/ILPPriceGetter.sol';
import { ICurveStableSwap } from '../interfaces/curve/ICurveStableSwap.sol';

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

import { console } from 'hardhat/console.sol';

// TODO: remove abstract after fixing constructor
contract CurveYieldStrategy is EightyTwentyRangeStrategyVault {
    using FullMath for uint256;

    IERC20 public usdt;
    IERC20 public weth;
    IERC20 public usdc;
    IERC20 public crvToken;

    ICurveGauge public gauge;
    ISwapRouter public uniV3Router;
    ILPPriceGetter public lpPriceHolder;
    ICurveStableSwap public triCryptoPool;

    /* solhint-enable const-name-snakecase */

    uint256 public constant MAX_BPS = 10_000;
    uint256 public FEE = 1000;

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        uint32 _ethPoolId
    ) BaseVault(_asset, _name, _symbol, _ethPoolId) {}

    // solhint-disable-next-line func-name-mixedcase
    function __CurveYieldStratergy__init(
        IERC20 _usdt,
        IERC20 _usdc,
        IERC20 _weth,
        IERC20 _crvToken,
        ICurveGauge _gauge,
        ISwapRouter _uniV3Router,
        ILPPriceGetter _lpPriceHolder,
        ICurveStableSwap _tricryptoPool
    ) internal onlyInitializing {
        usdt = _usdt;
        usdc = _usdc;
        weth = _weth;
        gauge = _gauge;
        crvToken = _crvToken;
        uniV3Router = _uniV3Router;
        triCryptoPool = _tricryptoPool;
        lpPriceHolder = _lpPriceHolder;
    }

    function initialize(
        address _owner,
        address _rageClearingHouse,
        address _rageCollateralToken,
        address _rageBaseToken,
        IERC20 _usdt,
        IERC20 _usdc,
        IERC20 _weth,
        IERC20 _crvToken,
        ICurveGauge _gauge,
        ISwapRouter _uniV3Router,
        ILPPriceGetter _lpPriceHolder,
        ICurveStableSwap _tricryptoPool
    ) external initializer {
        __BaseVault_init(_owner, _rageClearingHouse, _rageCollateralToken, _rageBaseToken);
        __CurveYieldStratergy__init(
            _usdt,
            _usdc,
            _weth,
            _crvToken,
            _gauge,
            _uniV3Router,
            _lpPriceHolder,
            _tricryptoPool
        );
    }

    function grantAllowances() public override {
        _grantBaseAllowances();
        usdt.approve(address(triCryptoPool), type(uint256).max);
        crvToken.approve(address(uniV3Router), type(uint256).max);
        asset.approve(address(triCryptoPool), type(uint256).max);
    }

    function changeFee(uint256 bps) external onlyOwner {
        require(bps < MAX_BPS, 'fee out of bounds');
        FEE = bps;
    }

    function withdrawFees() external onlyOwner {
        uint256 bal = crvToken.balanceOf(address(this));
        crvToken.transfer(owner(), bal);
    }

    function _afterDepositYield(uint256 amount) internal override {
        // asset.transferFrom(msg.sender, address(this), amount);
        console.log('before stake');
        _stake(amount);
        console.log('after stake');
    }

    function _beforeWithdrawYield(uint256 amount) internal override {
        gauge.withdraw(amount);
        _harvestFees();
    }

    function _depositBase(uint256 amount) internal override {
        usdc.transferFrom(msg.sender, address(this), amount);
        usdc.approve(address(uniV3Router), amount);
        bytes memory path = abi.encodePacked(usdc, uint24(500), usdt);

        console.log('mid');

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            amountIn: amount,
            amountOutMinimum: 0,
            recipient: address(this),
            deadline: _blockTimestamp()
        });

        uint256 usdtOut = uniV3Router.exactInput(params);
        console.log(usdtOut);

        // USDT, WBTC, WETH
        usdt.approve(address(triCryptoPool), usdtOut);
        uint256[3] memory amounts = [usdtOut, uint256(0), uint256(0)];
        triCryptoPool.add_liquidity(amounts, 0);

        _stake(asset.balanceOf(address(this)));
    }

    function _harvestFees() internal override {
        uint256 claimable = gauge.claimable_reward(address(this), address(crvToken));
        console.log('fees claimable from gauge: ', claimable);

        if (claimable > 0) {
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

            ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
                path: path,
                amountIn: afterDeductions,
                amountOutMinimum: 0,
                recipient: address(this),
                deadline: _blockTimestamp()
            });

            uint256 usdtOut = uniV3Router.exactInput(params);

            usdt.approve(address(triCryptoPool), usdtOut);
            uint256[3] memory amounts = [usdtOut, uint256(0), uint256(0)];
            triCryptoPool.add_liquidity(amounts, 0);

            _stake(usdtOut);
        }
    }

    function _stake(uint256 amount) internal override {
        console.log('amount', amount);
        asset.approve(address(gauge), amount);
        console.log('gauge address', address(gauge));
        gauge.deposit(amount);
    }

    function _stakedAssetBalance() internal view override returns (uint256) {
        return gauge.balanceOf(address(this));
    }

    function _withdrawBase(uint256 amount) internal override {
        uint256 pricePerLP = lpPriceHolder.lp_price();
        console.log('LP PRICE: ', pricePerLP);
        uint256 lpToWithdraw = ((amount * (10**12)) * (10**18)) / pricePerLP;
        console.log('LP TO WITHDRAW:', lpToWithdraw);
        console.log('IN GAUGE', gauge.balanceOf(address(this)));

        gauge.withdraw(lpToWithdraw);
        triCryptoPool.remove_liquidity_one_coin(lpToWithdraw, 0, 0);
        console.log('BAL: ', asset.balanceOf(address(this)));

        console.log('USDT', usdt.balanceOf(address(this)));
        usdt.approve(address(uniV3Router), amount * (10**12));

        bytes memory path = abi.encodePacked(usdt, uint24(500), usdc);

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            amountIn: amount,
            amountOutMinimum: 0,
            recipient: address(this),
            deadline: _blockTimestamp()
        });

        uniV3Router.exactInput(params);
    }

    function getMarketValue(uint256 amount) public view override returns (uint256 marketValue) {
        marketValue = amount.mulDiv(getPriceX128(), FixedPoint128.Q128);
    }

    //TODO: Add test case for this in unit tests.
    //TODO: Current impl assumes that that lpPrice has a scale of 10**18 and lp tokens has decimals of 10**18 - check if correct
    function getPriceX128() public view override returns (uint256 priceX128) {
        uint256 pricePerLP = lpPriceHolder.lp_price();
        return pricePerLP.mulDiv(FixedPoint128.Q128, 10**30); // 10**6 / (10**18*10**18)
    }
}
