// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import { IERC4626 } from 'contracts/interfaces/IERC4626.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { ILPPriceGetter } from '../interfaces/curve/ILPPriceGetter.sol';
import { ICurveStableSwap } from '../interfaces/curve/ICurveStableSwap.sol';

import { AggregatorV3Interface } from '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

contract VaultPeriphery is OwnableUpgradeable {
    using FullMath for uint256;

    error ZeroValue();
    error OutOfBounds();
    error NegativePrice();
    error SlippageToleranceBreached();

    IERC20 public usdc;
    IERC20 public usdt;
    IERC20 public weth;
    IERC20 public lpToken;

    IERC4626 public vault;

    ISwapRouter public swapRouter;
    ILPPriceGetter public lpOracle;
    ICurveStableSwap public stableSwap;

    AggregatorV3Interface internal ethOracle;

    /// @dev sum of fees + slippage when swapping usdc to usdt
    uint256 MAX_TOLERANCE = 50;
    uint256 MAX_BPS = 10_000;

    function initialize(
        IERC20 _usdc,
        IERC20 _usdt,
        IERC20 _weth,
        IERC20 _lpToken,
        IERC4626 _vault,
        ISwapRouter _swapRouter,
        ILPPriceGetter _lpOracle,
        ICurveStableSwap _stableSwap,
        AggregatorV3Interface _ethOracle
    ) external initializer {
        __Ownable_init();

        usdc = _usdc;
        usdt = _usdt;
        weth = _weth;
        vault = _vault;
        lpToken = _lpToken;

        lpOracle = _lpOracle;
        stableSwap = _stableSwap;
        swapRouter = _swapRouter;

        ethOracle = _ethOracle;

        weth.approve(address(stableSwap), type(uint256).max);
        usdt.approve(address(stableSwap), type(uint256).max);

        usdc.approve(address(swapRouter), type(uint256).max);

        lpToken.approve(address(vault), type(uint256).max);
    }

    function _getEthPrice(AggregatorV3Interface crvOracle) internal view returns (uint256) {
        (, int256 answer, , , ) = crvOracle.latestRoundData();
        if (answer < 0) revert NegativePrice();
        return (uint256(answer));
    }

    function depositUsdc(uint256 amount) external returns (uint256 sharesMinted) {
        if (amount == 0) revert ZeroValue();
        usdc.transferFrom(msg.sender, address(this), amount);

        bytes memory path = abi.encodePacked(usdc, uint24(500), usdt);

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            amountIn: amount,
            amountOutMinimum: 0,
            recipient: address(this),
            deadline: block.timestamp
        });

        uint256 usdtOut = swapRouter.exactInput(params);

        uint256 beforeSwapLpPrice = lpOracle.lp_price();

        stableSwap.add_liquidity([usdtOut, 0, 0], 0);

        uint256 balance = lpToken.balanceOf(address(this));

        if (balance.mulDiv(beforeSwapLpPrice, 10**18) < (amount * (MAX_BPS - MAX_TOLERANCE) * 10**12) / MAX_BPS)
            revert SlippageToleranceBreached();

        sharesMinted = vault.deposit(balance, msg.sender);
    }

    function depositWeth(uint256 amount) external returns (uint256 sharesMinted) {
        if (amount == 0) revert ZeroValue();
        weth.transferFrom(msg.sender, address(this), amount);

        uint256 beforeSwapLpPrice = lpOracle.lp_price();

        stableSwap.add_liquidity([0, 0, amount], 0);

        uint256 balance = lpToken.balanceOf(address(this));

        if (
            balance.mulDiv(beforeSwapLpPrice, 10**18) <
            _getEthPrice(ethOracle).mulDiv(amount * (MAX_BPS - MAX_TOLERANCE), 10**8 * MAX_BPS)
        ) revert SlippageToleranceBreached();

        sharesMinted = vault.deposit(lpToken.balanceOf(address(this)), msg.sender);
    }

    function updateTolerance(uint256 newTolerance) external onlyOwner {
        if (newTolerance > MAX_BPS) revert OutOfBounds();
        MAX_TOLERANCE = newTolerance;
    }

    function updateSwapRouter(address newRouter) external onlyOwner {
        if (newRouter == address(0)) revert ZeroValue();
        swapRouter = ISwapRouter(newRouter);
    }

    function updateEthOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert ZeroValue();
        ethOracle = AggregatorV3Interface(newOracle);
    }
}
