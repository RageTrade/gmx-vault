// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';

import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { IUniswapV2Router02 } from '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import { IUniswapV2Pair } from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

import { BaseRangeStrategyVault } from '../rangeStrategy/BaseRangeStrategyVault.sol';
import { BaseVault } from '../base/BaseVault.sol';
import { IMiniChefV2 } from '../interfaces/sushi/IMiniChefV2.sol';
import { Pricing } from '../libraries/Pricing.sol';

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

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        uint32 _ethPoolId
    ) BaseVault(_asset, _name, _symbol, _ethPoolId) {
        // solhint-disable-previous-line no-empty-blocks
    }

    // solhint-disable-next-line func-name-mixedcase
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
        YIELD STRATEGY
    */

    function getPriceX128() public view override returns (uint256 priceX128) {
        // Get price of the LP token based on the price of token0 and token1
        priceX128 = Pricing.getUniV2LPPriceX128(
            address(sushiPair),
            token0Oracle,
            token1Oracle,
            rageBaseToken.decimals(),
            maxOracleDelayTime,
            _blockTimestamp()
        );
    }

    function getMarketValue(uint256 amount) public view override returns (uint256 marketValue) {
        marketValue = amount.mulDiv(getPriceX128(), FixedPoint128.Q128);
    }

    // To convert yield token into USDC to cover loss on rage trade
    function _withdrawBase(uint256 amount) internal override {
        // Calculate amount of liquidity to withdraw for "amount" of base token
        uint256 liquidity = amount.mulDiv(
            (10**sushiPair.decimals()) * FixedPoint128.Q128,
            (10**rageBaseToken.decimals()) * getPriceX128()
        );

        // Remove Liquidity
        sushiRouter.removeLiquidity(token0, token1, liquidity, 0, 0, address(this), _blockTimestamp());

        uint256 token0Bal = IERC20(token0).balanceOf(address(this));
        uint256 token1Bal = IERC20(token1).balanceOf(address(this));

        // Swap tokens into base token if they are not base token
        address[] memory path;
        path[0] = token0;
        path[1] = token1;

        if (token0 != address(rageBaseToken)) {
            sushiRouter.swapExactTokensForTokens(token0Bal, 0, path, address(this), _blockTimestamp());
        }

        if (token1 != address(rageBaseToken)) {
            sushiRouter.swapExactTokensForTokens(token1Bal, 0, path, address(this), _blockTimestamp());
        }
    }

    // To deposit the USDC profit made from rage trade into yield protocol
    function _depositBase(uint256 amount) internal override {
        _depositToken(address(rageBaseToken), amount);
    }

    function _stake(
        uint256 /** amount */
    ) internal override {
        asset.approve(address(sushiChef), type(uint256).max);
        uint256 assetBal = asset.balanceOf(address(this));

        if (assetBal > 0) {
            sushiChef.deposit(sushiPoolId, assetBal, address(this));
        }
    }

    // TODO: Need to add extra implementation for external rewards (Not needed for WETH-USDC pool)
    function _harvestFees() internal override {
        IMiniChefV2(sushiChef).harvest(sushiPoolId, address(this));
        uint256 rewardBal = IERC20(rewardToken).balanceOf(address(this));

        if (rewardBal > 0) {
            _depositReward();
        }
    }

    function _depositReward() internal {
        uint256 rewardBal = IERC20(rewardToken).balanceOf(address(this));
        _depositToken(rewardToken, rewardBal);
    }

    function _depositToken(address token, uint256 amount) internal {
        uint256 amountHalf = amount / 2;

        uint256 token0Bal;
        uint256 token1Bal;

        // Swap half of base token into the set tokens if they are already not base tokens
        if (token0 != address(token)) {
            address[] memory path;
            path[0] = token;
            path[1] = token0;

            uint256[] memory amounts = sushiRouter.swapExactTokensForTokens(
                amountHalf,
                0,
                path,
                address(this),
                _blockTimestamp()
            );
            token0Bal = amounts[amounts.length - 1];
        }

        if (token1 != address(token)) {
            address[] memory path;
            path[0] = token;
            path[1] = token1;

            uint256[] memory amounts = sushiRouter.swapExactTokensForTokens(
                amountHalf,
                0,
                path,
                address(this),
                _blockTimestamp()
            );
            token1Bal = amounts[amounts.length - 1];
        }

        // Add Liquidity based on the token balance available
        // TODO: clean residue incase both full token0 & token1 were not deposited into LP
        sushiRouter.addLiquidity(token0, token1, token0Bal, token1Bal, 1, 1, address(this), _blockTimestamp());
    }

    function _stakedAssetBalance() internal view override returns (uint256) {
        (
            uint256 amount, /** uint256 rewardDebt */

        ) = sushiChef.userInfo(sushiPoolId, address(this));
        return amount;
    }

    function _afterDepositYield(
        uint256 /** amount */
    ) internal override {
        // stake outstanding SLP
        _stake(asset.balanceOf(address(this)));
    }

    function _beforeWithdrawYield(uint256 amount) internal override {
        // unstake and return principal
        sushiChef.withdraw(sushiPoolId, amount, msg.sender);
        // harvest & send share of harvested fees to user
        _harvestFees();
    }
}
