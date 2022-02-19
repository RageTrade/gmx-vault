// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;
import { BaseVault } from '../base/BaseVault.sol';

import { BaseRangeStrategyVault } from '../rangeStrategy/BaseRangeStrategyVault.sol';
import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';

import { IUniswapV2Router02 } from '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import { IUniswapV2Pair } from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

import { Pricing } from '../libraries/Pricing.sol';

import { IMiniChefV2 } from '../interfaces/sushi/IMiniChefV2.sol';

import { console } from 'hardhat/console.sol';

struct SushiParams {
    address sushiRouter;
    address sushiPair;
    address sushiChef;
    address token0;
    address token1;
    address rewardToken;
    address token0Oracle;
    address token1Oracle;
    uint256 maxOracleDelayTime;
    address[] baseToToken0Route;
    address[] baseToToken1Route;
    address[] token0ToBaseRoute;
    address[] token1ToBaseRoute;
    address[] rewardToToken0Route;
    address[] rewardToToken1Route;
}

contract BaseSushiVault is BaseRangeStrategyVault {
    using FullMath for uint256;

    IUniswapV2Router02 public sushiRouter;
    IUniswapV2Pair public sushiPair;
    IMiniChefV2 public sushiChef;

    address public token0;
    address public token1;
    address public rewardToken;

    address public token0Oracle;
    address public token1Oracle;

    uint256 public sushiPoolId;
    uint256 public maxOracleDelayTime;
    uint256 public lastHarvestTime;

    address[] public baseToToken0Route;
    address[] public baseToToken1Route;
    address[] public token0ToBaseRoute;
    address[] public token1ToBaseRoute;
    address[] public rewardToToken0Route;
    address[] public rewardToToken1Route;

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        address _vWethAddress
    ) BaseVault(_asset, _name, _symbol, _vWethAddress) {}

    function __BaseSushiVault_init(SushiParams memory _sushiParams) internal onlyInitializing {
        sushiRouter = IUniswapV2Router02(_sushiParams.sushiRouter);
        sushiPair = IUniswapV2Pair(_sushiParams.sushiPair);
        sushiChef = IMiniChefV2(_sushiParams.sushiChef);
        token0 = _sushiParams.token0;
        token1 = _sushiParams.token1;
        rewardToken = _sushiParams.rewardToken;
        token0Oracle = _sushiParams.token0Oracle;
        token1Oracle = _sushiParams.token1Oracle;
        maxOracleDelayTime = _sushiParams.maxOracleDelayTime;

        baseToToken0Route = _sushiParams.baseToToken0Route;
        baseToToken1Route = _sushiParams.baseToToken1Route;
        token0ToBaseRoute = _sushiParams.token0ToBaseRoute;
        token1ToBaseRoute = _sushiParams.token1ToBaseRoute;
        rewardToToken0Route = _sushiParams.rewardToToken0Route;
        rewardToToken1Route = _sushiParams.rewardToToken1Route;

    }

    function initialize(
        address _owner,
        address _rageClearingHouse,
        address _rageCollateralToken,
        address _rageBaseToken,
        SushiParams memory _sushiParams
    ) external initializer {
        __BaseVault_init(_owner, _rageClearingHouse, _rageCollateralToken, _rageBaseToken);
        __BaseSushiVault_init(_sushiParams);
    }

    function grantAllowances() external override {
        _grantBaseAllowances();
        _grantSushiAllowances();
    }

    function _grantSushiAllowances() internal {
        rageBaseToken.approve(address(sushiRouter), (1 << 256) - 1);
        IERC20(token0).approve(address(sushiRouter), (1 << 256) - 1);
        IERC20(token1).approve(address(sushiRouter), (1 << 256) - 1);
    }

    /*
        YEILD STRATEGY
    */

    function depositTokens() external override {}

    function withdrawTokens() external override {}

    function getPriceX128() public view override returns (uint256 priceX128) {
        //Get price of the LP token based on the price of token0 and token1
        priceX128 = Pricing.getUniV2LPPriceX128(
            address(sushiPair),
            token0Oracle,
            token1Oracle,
            rageBaseToken.decimals(),
            maxOracleDelayTime
        );
    }

    function getMarketValue(uint256 balance) public view override returns (uint256 marketValue) {
        marketValue = balance.mulDiv(getPriceX128(), FixedPoint128.Q128);
    }

    //To convert yeild token into USDC to cover loss on rage trade
    function withdrawBase(uint256 amount) internal override {
        //Calculate amount of liquidity to withdraw for "amount" of base token
        uint256 liquidity = amount.mulDiv(
            (10**sushiPair.decimals()) * FixedPoint128.Q128,
            (10**rageBaseToken.decimals()) * getPriceX128()
        );

        //Remove Liquidity
        sushiRouter.removeLiquidity(token0, token1, liquidity, 0, 0, address(this), block.timestamp);

        uint256 token0Bal = IERC20(token0).balanceOf(address(this));
        uint256 token1Bal = IERC20(token1).balanceOf(address(this));

        //Swap tokens into base token if they are not base token
        if (token0 != address(rageBaseToken)) {
            sushiRouter.swapExactTokensForTokens(token0Bal, 0, token0ToBaseRoute, address(this), block.timestamp);
        }

        if (token1 != address(rageBaseToken)) {
            sushiRouter.swapExactTokensForTokens(token1Bal, 0, token1ToBaseRoute, address(this), block.timestamp);
        }
    }

    //To deposit the USDC profit made from rage trade into yeild protocol
    function depositBase(uint256 amount) internal override {
        _depositToken(address(rageBaseToken), amount, baseToToken0Route, baseToToken1Route);
    }

    function stake() internal override {
        uint256 assetBal = asset.balanceOf(address(this));

        if (assetBal > 0) {
            sushiChef.deposit(sushiPoolId, assetBal, address(this));
        }
    }

    function harvestFees() internal override {
        //TODO:Need to add extra implementation for external rewards (Not needed for WETH-USDC pool)
        IMiniChefV2(sushiChef).harvest(sushiPoolId, address(this));
        uint256 rewardBal = IERC20(rewardToken).balanceOf(address(this));
        if (rewardBal > 0) {
            depositReward();
            lastHarvestTime = block.timestamp;
        }
    }

    function depositReward() internal {
        uint256 rewardBal = IERC20(rewardToken).balanceOf(address(this));
        _depositToken(rewardToken, rewardBal, rewardToToken0Route, rewardToToken1Route);
    }

    function _depositToken(
        address token,
        uint256 amount,
        address[] storage token0Route,
        address[] storage token1Route
    ) internal {
        uint256 amountHalf = amount / 2;

        uint256 token0Bal;
        uint256 token1Bal;
        //Swap half of base token into the set tokens if they are already not base tokens
        if (token0 != address(token)) {
            uint256[] memory amounts = sushiRouter.swapExactTokensForTokens(
                amountHalf,
                0,
                token0Route,
                address(this),
                block.timestamp
            );
            token0Bal = amounts[amounts.length - 1];
        }

        if (token1 != address(token)) {
            uint256[] memory amounts = sushiRouter.swapExactTokensForTokens(
                amountHalf,
                0,
                token1Route,
                address(this),
                block.timestamp
            );
            token1Bal = amounts[amounts.length - 1];
        }

        //Add Liquidity based on the token balance available
        sushiRouter.addLiquidity(token0, token1, token0Bal, token1Bal, 1, 1, address(this), block.timestamp);
    }

    function stakedAssetBalance() internal view override returns (uint256){}

}
