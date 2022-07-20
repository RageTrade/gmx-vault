// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { EightyTwentyRangeStrategyVault } from '../rangeStrategy/EightyTwentyRangeStrategyVault.sol';

import { IGlpManager } from 'contracts/interfaces/glp/IGlpManager.sol';
import { IRewardTracker } from 'contracts/interfaces/glp/IRewardTracker.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/glp/IRewardRouterV2.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

contract GMXYieldStrategy is EightyTwentyRangeStrategyVault {
    using FullMath for uint256;

    /* solhint-disable var-name-mixedcase */
    uint256 public constant MAX_BPS = 10_000;

    /* solhint-disable var-name-mixedcase */
    uint256 public FEE = 1000;

    uint256 public protocolFee;
    uint256 public wethThreshold;

    IERC20 private gmx;
    IERC20 private glp;
    IERC20 private sGlp;
    IERC20 private weth;
    IERC20 private esGMX;

    IGlpManager private glpManager;
    IRewardRouterV2 private rewardRouter;

    struct GMXYieldStrategyInitParams {
        EightyTwentyRangeStrategyVaultInitParams eightyTwentyRangeStrategyVaultInitParams;
        IERC20 gmx;
        IERC20 glp;
        IERC20 sGlp;
        IERC20 weth;
        IERC20 esGMX;
        IGlpManager glpManager;
        IRewardRouterV2 rewardRouter;
    }

    function initialize(GMXYieldStrategyInitParams memory gmxYieldStrategyInitParams) external initializer {
        __GMXYieldStrategy_init(gmxYieldStrategyInitParams);
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __GMXYieldStrategy_init(GMXYieldStrategyInitParams memory params) internal onlyInitializing {
        __EightyTwentyRangeStrategyVault_init(params.eightyTwentyRangeStrategyVaultInitParams);
        weth = params.weth;
        glp = params.glp;
        sGlp = params.sGlp;
        weth = params.weth;
        esGMX = params.esGMX;
        rewardRouter = params.rewardRouter;
        glpManager = params.glpManager;
    }

    // TODO: add function for updating params
    // function updateCurveParams(
    //     uint256 _feeBps,
    //     uint256 _stablecoinSlippage,
    //     uint256 _crvHarvestThreshold,
    //     uint256 _crvSlippageTolerance,
    //     AggregatorV3Interface _crvOracle
    // ) external onlyOwner {
    //     if (_feeBps < MAX_BPS && _stablecoinSlippage < MAX_BPS && _crvSlippageTolerance < MAX_BPS) {
    //         FEE = _feeBps;
    //         crvOracle = _crvOracle;
    //         crvHarvestThreshold = _crvHarvestThreshold;
    //         crvSwapSlippageTolerance = _crvSlippageTolerance;
    //         stablecoinSlippageTolerance = _stablecoinSlippage;
    //     } else revert CYS_INVALID_SETTER_VALUE();

    //     emit Logic.CurveParamsUpdated(
    //         _feeBps,
    //         _stablecoinSlippage,
    //         _crvHarvestThreshold,
    //         _crvSlippageTolerance,
    //         address(_crvOracle)
    //     );
    // }

    // TODO: add function for granting allowance
    /// @notice grants one time max allowance to various third parties
    // function grantAllowances() public override onlyOwner {
    //     _grantBaseAllowances();

    //     asset.approve(address(gauge), type(uint256).max);
    //     asset.approve(address(triCryptoPool), type(uint256).max);

    //     /// @dev USDT requires allowance set to 0 before re-approving
    //     usdc.approve(address(uniV3Router), 0);
    //     usdt.approve(address(uniV3Router), 0);
    //     usdt.approve(address(triCryptoPool), 0);

    //     usdc.approve(address(uniV3Router), type(uint256).max);
    //     usdt.approve(address(uniV3Router), type(uint256).max);
    //     usdt.approve(address(triCryptoPool), type(uint256).max);

    //     crvToken.approve(address(uniV3Router), type(uint256).max);
    // }

    // TODO: add function for withdrawing fees
    /// @notice withdraw accumulated CRV fees
    // function withdrawFees() external onlyOwner {
    //     uint256 bal = crvToken.balanceOf(address(this)) - crvPendingToSwap;
    //     crvToken.transfer(msg.sender, bal);
    //     emit Logic.FeesWithdrawn(bal);
    // }

    /// @notice triggered from the afterDeposit hook, stakes the deposited tricrypto LP tokens
    /// @param amount amount of LP tokens
    function _afterDepositYield(uint256 amount) internal override {
        //NO OP
    }

    /// @notice triggered from beforeWithdraw hook
    /// @param amount amount of LP tokens
    function _beforeWithdrawYield(uint256 amount) internal override {}

    /// @notice sells rageSettlementToken for LP tokens and then stakes LP tokens
    /// @param amount amount of rageSettlementToken
    function _convertSettlementTokenToAsset(uint256 amount) internal override {
        //USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        rewardRouter.mintAndStakeGlp(address(rageSettlementToken), amount, amount.mulDiv(95 * 10**12,100), 0);
    }

    /// @notice claims the accumulated CRV rewards from the gauge, sells CRV rewards for LP tokens and stakes LP tokens
    function _harvestFees() internal override {
        rewardRouter.handleRewards(false, false, true, true, true, true, false);
        uint256 wethHarvested = weth.balanceOf(address(this))-protocolFee;
        if(wethHarvested > wethThreshold) {
            uint256 protocolFeeHarvested = (wethHarvested*FEE)/MAX_BPS;
            uint256 wethToCompound = wethHarvested - protocolFeeHarvested;
            //TODO: use vaultBatchManager to deposit eth
            // uint256 wethToCompoundMinUsdg = (wethToCompound*getWethPrice())*.95;
            // rewardRouter.mintAndStakeGlp(weth, wethToCompound, wethToCompoundMinUsdg, 0);
            protocolFee+=protocolFeeHarvested;
        }
    }

    /// @notice stakes LP tokens (i.e deposits into reward gauge)
    /// @param amount amount of LP tokens
    function _stake(uint256 amount) internal override {
        //NO OP
    }

    /// @notice total LP tokens staked in the curve rewards gauge
    function _stakedAssetBalance() internal view override returns (uint256) {}

    /// @notice withdraws LP tokens from gauge, sells LP token for rageSettlementToken
    /// @param amount amount of LP tokens
    function _convertAssetToSettlementToken(uint256 amount) internal override returns (uint256 usdcAmount) {
        //USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        rewardRouter.unstakeAndRedeemGlp(address(rageSettlementToken), amount, amount.mulDiv(95 * 10**12 ,100), address(this));
    }

    /// @notice compute notional value for given amount of LP tokens
    /// @param amount amount of LP tokens
    function getMarketValue(uint256 amount) public view override returns (uint256 marketValue) {
        marketValue = amount.mulDiv(getPriceX128(), FixedPoint128.Q128);
    }

    /// @notice gives x128 price of 1 tricrypto LP token in USDC unit (10**6)
    function getPriceX128() public view override returns (uint256 priceX128) {
        uint256 aum = glpManager.getAum(false);
        uint256 totalSupply = glp.totalSupply();

        uint256 price = aum / totalSupply;

        return price.mulDiv(FixedPoint128.Q128, 10**6);
    }
}
