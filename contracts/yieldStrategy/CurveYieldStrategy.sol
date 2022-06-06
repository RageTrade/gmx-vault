// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { EightyTwentyRangeStrategyVault } from '../rangeStrategy/EightyTwentyRangeStrategyVault.sol';

import { ICurveGauge } from '../interfaces/curve/ICurveGauge.sol';
import { ILPPriceGetter } from '../interfaces/curve/ILPPriceGetter.sol';
import { ICurveStableSwap } from '../interfaces/curve/ICurveStableSwap.sol';

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { AggregatorV3Interface } from '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

import { SwapManager } from '../libraries/SwapManager.sol';

import { Logic } from '../libraries/Logic.sol';

contract CurveYieldStrategy is EightyTwentyRangeStrategyVault {
    using FullMath for uint256;

    error CYS_INVALID_SETTER_VALUE(uint256 value);
    error CYS_EXTERAL_CALL_FAILED(string reason);

    IERC20 private usdt; // 6 decimals
    IERC20 private weth; // 18 decimals
    IERC20 private usdc; // 6 decimals
    IERC20 private crvToken; // 18 decimals

    ICurveGauge private gauge; // curve gauge, which gives CRV emissions for staking triCrypto LP token
    ISwapRouter private uniV3Router; // uniswap swap router
    ILPPriceGetter private lpPriceHolder; // price-manipulation resistant triCrypto lp price oracle
    ICurveStableSwap private triCryptoPool; // triCrypto stableSwap address

    AggregatorV3Interface private crvOracle;

    uint256 private crvPendingToSwap; // in CRV (10**18)
    uint256 private crvHarvestThreshold; // in CRV (10**18)
    uint256 private crvSwapSlippageTolerance; // in bps, max 10**4
    uint256 private stablecoinSlippageTolerance; // in bps, max 10**4

    /* solhint-disable var-name-mixedcase */
    uint256 public constant MAX_BPS = 10_000;

    /* solhint-disable var-name-mixedcase */
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

    /* solhint-disable-next-line func-name-mixedcase */
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

    function updateCurveParams(
        uint256 _feeBps,
        uint256 _stablecoinSlippage,
        uint256 _crvHarvestThreshold,
        uint256 _crvSlippageTolerance,
        AggregatorV3Interface _crvOracle
    ) external onlyOwner {
        if (_feeBps < MAX_BPS) FEE = _feeBps;
        else revert CYS_INVALID_SETTER_VALUE(_feeBps);

        if (_stablecoinSlippage < MAX_BPS) stablecoinSlippageTolerance = _stablecoinSlippage;
        else revert CYS_INVALID_SETTER_VALUE(_stablecoinSlippage);

        crvHarvestThreshold = _crvHarvestThreshold;

        if (_crvSlippageTolerance < MAX_BPS) crvSwapSlippageTolerance = _crvSlippageTolerance;
        else revert CYS_INVALID_SETTER_VALUE(_stablecoinSlippage);

        if (address(_crvOracle) != address(0)) crvOracle = _crvOracle;
        else revert CYS_INVALID_SETTER_VALUE(0);

        emit Logic.CurveParamsUpdated(
            _feeBps,
            _stablecoinSlippage,
            _crvHarvestThreshold,
            _crvSlippageTolerance,
            address(_crvOracle)
        );
    }

    /// @notice grants one time max allowance to various third parties
    function grantAllowances() public override onlyOwner {
        _grantBaseAllowances();

        asset.approve(address(gauge), type(uint256).max);
        asset.approve(address(triCryptoPool), type(uint256).max);

        /// @dev USDT requires allowance set to 0 before re-approving
        usdc.approve(address(uniV3Router), 0);
        usdt.approve(address(uniV3Router), 0);
        usdt.approve(address(triCryptoPool), 0);

        usdc.approve(address(uniV3Router), type(uint256).max);
        usdt.approve(address(uniV3Router), type(uint256).max);
        usdt.approve(address(triCryptoPool), type(uint256).max);

        crvToken.approve(address(uniV3Router), type(uint256).max);
    }

    /// @notice withdraw accumulated CRV fees
    function withdrawFees() external onlyOwner {
        uint256 bal = crvToken.balanceOf(address(this));
        crvToken.transfer(msg.sender, bal);
        emit Logic.FeesWithdrawn(bal);
    }

    /// @notice triggered from the afterDeposit hook, stakes the deposited tricrypto LP tokens
    /// @param amount amount of LP tokens
    function _afterDepositYield(uint256 amount) internal override {
        emit Logic.StateInfo(lpPriceHolder.lp_price());
        _stake(amount);
    }

    /// @notice triggered from beforeWithdraw hook
    /// @param amount amount of LP tokens
    function _beforeWithdrawYield(uint256 amount) internal override {
        emit Logic.StateInfo(lpPriceHolder.lp_price());
        gauge.withdraw(amount);
        _harvestFees();
    }

    /// @notice sells settlementToken for LP tokens and then stakes LP tokens
    /// @param amount amount of settlementToken
    function _convertSettlementTokenToAsset(uint256 amount) internal override {
        bytes memory path = abi.encodePacked(usdc, uint24(500), usdt);
        SwapManager.swapUsdcToUsdtAndAddLiquidity(
            amount,
            stablecoinSlippageTolerance,
            path,
            uniV3Router,
            triCryptoPool
        );
        _stake(asset.balanceOf(address(this)));
    }

    /// @notice claims the accumulated CRV rewards from the gauge, sells CRV rewards for LP tokens and stakes LP tokens
    function _harvestFees() internal override {
        uint256 claimable = gauge.claimable_reward(address(this), address(crvToken)) + crvPendingToSwap;

        if (claimable > crvHarvestThreshold) {
            uint256 afterDeductions = claimable - ((claimable * FEE) / MAX_BPS);
            gauge.claim_rewards(address(this));

            emit Logic.Harvested(claimable);

            bytes memory path = abi.encodePacked(
                address(crvToken),
                uint24(3000),
                address(weth),
                uint24(500),
                address(usdt)
            );

            try
                SwapManager.swapCrvToUsdtAndAddLiquidity(
                    afterDeductions,
                    crvSwapSlippageTolerance,
                    crvOracle,
                    path,
                    uniV3Router,
                    triCryptoPool
                )
            {
                // stake CRV if swap is successful
                _stake(asset.balanceOf(address(this)));
                // set pending CRV to 0
                crvPendingToSwap = 0;
            } catch Error(string memory reason) {
                // if swap is failed due to slippage, it should not stop executing rebalance
                // uniswap router returns 'Too little received' in case of minOut is not matched
                if (keccak256(abi.encodePacked(reason)) == keccak256('Too little received')) {
                    // account for pending CRV which were not swapped, to be used in next swap
                    crvPendingToSwap += claimable;
                    // emit event with current slippage value
                    emit Logic.CrvSwapFailedDueToSlippage(crvSwapSlippageTolerance);
                }
                // if external call fails due to any other reason, revert with same
                else revert CYS_EXTERAL_CALL_FAILED(reason);
            }
        }
    }

    /// @notice stakes LP tokens (i.e deposits into reward gauge)
    /// @param amount amount of LP tokens
    function _stake(uint256 amount) internal override {
        gauge.deposit(amount);
        emit Logic.Staked(amount, msg.sender);
    }

    /// @notice total LP tokens staked in the curve rewards gauge
    function _stakedAssetBalance() internal view override returns (uint256) {
        return gauge.balanceOf(address(this));
    }

    /// @notice withdraws LP tokens from gauge, sells LP token for settlementToken
    /// @param amount amount of LP tokens
    function _convertAssetToSettlementToken(uint256 amount) internal override returns (uint256 usdcAmount) {
        return
            Logic.convertAssetToSettlementToken(
                amount,
                stablecoinSlippageTolerance,
                lpPriceHolder,
                gauge,
                triCryptoPool,
                usdt,
                uniV3Router,
                usdc
            );
    }

    /// @notice compute notional value for given amount of LP tokens
    /// @param amount amount of LP tokens
    function getMarketValue(uint256 amount) public view override returns (uint256 marketValue) {
        return Logic.getMarketValue(amount, lpPriceHolder);
    }

    /// @notice gives x128 price of 1 tricrypto LP token
    function getPriceX128() public view override returns (uint256 priceX128) {
        return Logic.getPriceX128(lpPriceHolder);
    }
}
