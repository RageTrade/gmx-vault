// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC4626 } from 'contracts/interfaces/IERC4626.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { IGlpManager } from 'contracts/interfaces/gmx/IGlpManager.sol';
import { ISGLPExtended } from 'contracts/interfaces/gmx/ISGLPExtended.sol';
import { IRewardTracker } from 'contracts/interfaces/gmx/IRewardTracker.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';
import { IGMXBatchingManager } from 'contracts/interfaces/gmx/IGMXBatchingManager.sol';
import { IGlpStakingManager } from 'contracts/interfaces/gmx/IGlpStakingManager.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

import { EightyTwentyRangeStrategyVault } from '../../rangeStrategy/EightyTwentyRangeStrategyVault.sol';

contract GMXYieldStrategy is EightyTwentyRangeStrategyVault {
    using FullMath for uint256;

    error GYS_INVALID_SETTER_VALUES();

    event FeesWithdrawn(uint256 vaule);
    event GmxParamsUpdated(uint256 newFee, address batchingManager, address stakingManager);

    event TokenWithdrawn(address token, uint256 sGLPQuantity, uint256 shares, address receiver);
    event TokenRedeemded(address token, uint256 sGLPQuantity, uint256 shares, address receiver);

    /* solhint-disable var-name-mixedcase */
    uint256 public constant MAX_BPS = 10_000;

    /* solhint-disable var-name-mixedcase */
    uint256 public FEE = 1000;

    uint256 public wethThreshold;
    uint256 public usdcReedemSlippage;
    uint256 public usdcConversionThreshold;

    IERC20 private glp;
    IERC20 private weth;
    IERC20 private fsGlp;

    IGlpManager private glpManager;
    IRewardRouterV2 private rewardRouter;
    IGlpStakingManager private stakingManager;
    IGMXBatchingManager private batchingManager;

    struct GMXYieldStrategyInitParams {
        EightyTwentyRangeStrategyVaultInitParams eightyTwentyRangeStrategyVaultInitParams;
        IERC20 glp;
        IERC20 weth;
        IGlpManager glpManager;
        IRewardRouterV2 rewardRouter;
    }

    function initialize(GMXYieldStrategyInitParams memory gmxYieldStrategyInitParams) external initializer {
        __GMXYieldStrategy_init(gmxYieldStrategyInitParams);
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __GMXYieldStrategy_init(GMXYieldStrategyInitParams memory params) internal onlyInitializing {
        __EightyTwentyRangeStrategyVault_init(params.eightyTwentyRangeStrategyVaultInitParams);
        glp = params.glp;
        weth = params.weth;
        glpManager = params.glpManager;
        rewardRouter = params.rewardRouter;

        fsGlp = IERC20(ISGLPExtended(address(asset)).stakedGlpTracker());
    }

    function updateGMXParams(
        uint256 _feeBps,
        uint256 _usdcConversionThreshold,
        uint256 _usdcReedemSlippage,
        address _batchingManager,
        address _stakingManager
    ) external onlyOwner {
        if (_feeBps < MAX_BPS && _batchingManager != address(0)) {
            FEE = _feeBps;
            usdcReedemSlippage = _usdcReedemSlippage;
            usdcConversionThreshold = _usdcConversionThreshold;
            batchingManager = IGMXBatchingManager(_batchingManager);
            stakingManager = IGlpStakingManager(_stakingManager);
        } else revert GYS_INVALID_SETTER_VALUES();

        emit GmxParamsUpdated(_feeBps, _batchingManager, _stakingManager);
    }

    /// @notice grants one time max allowance to various third parties
    function grantAllowances() public override onlyOwner {
        _grantBaseAllowances();

        asset.approve(address(glpManager), type(uint256).max);
        asset.approve(address(rewardRouter), type(uint256).max);
        asset.approve(address(stakingManager), type(uint256).max);

        weth.approve(address(glpManager), type(uint256).max);
        weth.approve(address(rewardRouter), type(uint256).max);
        weth.approve(address(stakingManager), type(uint256).max);

        rageSettlementToken.approve(address(glpManager), type(uint256).max);
        rageSettlementToken.approve(address(rewardRouter), type(uint256).max);
        rageSettlementToken.approve(address(stakingManager), type(uint256).max);
    }

    /// @notice triggered from the afterDeposit hook, stakes the deposited tricrypto LP tokens
    /// @param amount amount of LP tokens
    function _afterDepositYield(uint256 amount) internal override {
        stakingManager.deposit(amount, address(this));
    }

    /// @notice triggered from beforeWithdraw hook
    /// @param amount amount of LP tokens
    function _beforeWithdrawYield(uint256 amount) internal override {
        stakingManager.withdraw(amount, address(this), address(this));
    }

    /// @notice sells rageSettlementToken for LP tokens and then stakes LP tokens
    /// @param amount amount of rageSettlementToken
    function _convertSettlementTokenToAsset(uint256 amount) internal override {
        //USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        stakingManager.depositToken(address(rageSettlementToken), amount);
    }

    /// @notice claims the accumulated CRV rewards from the gauge, sells CRV rewards for LP tokens and stakes LP tokens
    function _harvestFees() internal override {
        //NO OP
    }

    /// @notice stakes LP tokens (i.e deposits into reward gauge)
    /// @param amount amount of LP tokens
    function _stake(uint256 amount) internal override {
        //NO OP
    }

    /// @notice total LP tokens staked in the curve rewards gauge
    function _stakedAssetBalance() internal view override returns (uint256) {
        return fsGlp.balanceOf(address(this)) + stakingManager.maxWithdraw(address(this));
    }

    /// @notice withdraws LP tokens from gauge, sells LP token for rageSettlementToken
    /// @param usdcAmountDesired amount of USDC desired
    function _convertAssetToSettlementToken(uint256 usdcAmountDesired) internal override returns (uint256 usdcAmount) {
        /// @dev if usdcAmountDesired < 10, then there is precision issue while redeeming for usdg
        if (usdcAmountDesired < usdcConversionThreshold) return 0;
        uint256 glpAmountDesired = usdcAmountDesired.mulDiv(1 << 128, getPriceX128());
        // USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        stakingManager.withdraw(glpAmountDesired, address(this), address(this));
        rewardRouter.unstakeAndRedeemGlp(
            address(rageSettlementToken),
            glpAmountDesired, // glp amount
            usdcAmountDesired.mulDiv(usdcReedemSlippage, MAX_BPS), // usdc
            address(this)
        );

        usdcAmount = rageSettlementToken.balanceOf(address(this));
    }

    /// @notice compute notional value for given amount of LP tokens
    /// @param assetAmount amount of asset tokens
    function getMarketValue(uint256 assetAmount) public view override returns (uint256 marketValue) {
        marketValue = assetAmount.mulDiv(getPriceX128(), FixedPoint128.Q128);
    }

    /// @notice gives x128 price of 1 ASSET token in USDC unit (10**6)
    function getPriceX128() public view override returns (uint256 priceX128) {
        uint256 aum = glpManager.getAum(false);
        uint256 totalSupply = glp.totalSupply();
        // USDC 10**6 * TOTAL SUPPLY GLP 10**18 / (AUM 10**30 * ASSET SGLP 10**18)
        return aum.mulDiv(FixedPoint128.Q128, totalSupply * 1e24);
    }

    function redeemToken(
        IERC20 token,
        uint256 shares,
        uint256 minTokenOut,
        address receiver
    ) external {
        uint256 sGLPReceived = redeem(shares, address(this), msg.sender);

        asset.approve(address(glpManager), sGLPReceived);

        rewardRouter.unstakeAndRedeemGlp(address(token), sGLPReceived, minTokenOut, receiver);

        emit TokenRedeemded(address(token), sGLPReceived, shares, receiver);
    }

    function withdrawToken(
        IERC20 token,
        uint256 _sGLP,
        uint256 minTokenOut,
        address receiver
    ) external {
        uint256 shares = withdraw(_sGLP, address(this), msg.sender);

        asset.approve(address(glpManager), _sGLP);

        rewardRouter.unstakeAndRedeemGlp(address(token), _sGLP, minTokenOut, receiver);

        emit TokenWithdrawn(address(token), _sGLP, shares, receiver);
    }
}
