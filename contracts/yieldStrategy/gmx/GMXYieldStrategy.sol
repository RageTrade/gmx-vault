// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC4626 } from 'contracts/interfaces/IERC4626.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { IGlpManager } from 'contracts/interfaces/gmx/IGlpManager.sol';
import { ISGLPExtended } from 'contracts/interfaces/gmx/ISGLPExtended.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';
import { IGlpStakingManager } from 'contracts/interfaces/gmx/IGlpStakingManager.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

import { EightyTwentyRangeStrategyVault } from '../../rangeStrategy/EightyTwentyRangeStrategyVault.sol';

contract GMXYieldStrategy is EightyTwentyRangeStrategyVault {
    using FullMath for uint256;

    error GYS_INVALID_SETTER_VALUES();

    event TokenWithdrawn(address token, uint256 sGLPQuantity, uint256 shares, address receiver);
    event TokenRedeemded(address token, uint256 sGLPQuantity, uint256 shares, address receiver);

    event GmxParamsUpdated(address stakingManager, uint256 usdcReedemSlippage, uint240 usdcConversionThreshold);

    uint256[100] private _gaps;

    /* solhint-disable var-name-mixedcase */
    uint16 public constant MAX_BPS = 10_000;

    uint16 public usdcReedemSlippage;
    uint240 public usdcConversionThreshold;

    IERC20 private glp;
    IERC20 private fsGlp;

    IGlpManager private glpManager;
    IRewardRouterV2 private rewardRouter;
    IGlpStakingManager private stakingManager;

    uint256[100] private _gaps2;

    struct GMXYieldStrategyInitParams {
        EightyTwentyRangeStrategyVaultInitParams eightyTwentyRangeStrategyVaultInitParams;
        IRewardRouterV2 rewardRouter;
    }

    function initialize(GMXYieldStrategyInitParams memory gmxYieldStrategyInitParams) external initializer {
        __GMXYieldStrategy_init(gmxYieldStrategyInitParams);
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __GMXYieldStrategy_init(GMXYieldStrategyInitParams memory params) internal onlyInitializing {
        __EightyTwentyRangeStrategyVault_init(params.eightyTwentyRangeStrategyVaultInitParams);
        rewardRouter = params.rewardRouter;

        glp = IERC20(ISGLPExtended(address(asset)).glp());
        fsGlp = IERC20(ISGLPExtended(address(asset)).stakedGlpTracker());
        glpManager = IGlpManager(ISGLPExtended(address(asset)).glpManager());
    }

    /// @notice updates several state variables related to external addresses, slippage, fee, threshold, etc.
    /// @param _stakingManager address of staking manager (which compounds rewards)
    /// @param _usdcReedemSlippage max slippage for _convertAssetToSettlementToken
    /// @param _usdcConversionThreshold threshold value for swapping asset to settlementToken
    function updateGMXParams(
        address _stakingManager,
        uint16 _usdcReedemSlippage,
        uint240 _usdcConversionThreshold
    ) external onlyOwner {
        if (_stakingManager != address(0) && _usdcReedemSlippage < MAX_BPS) {
            usdcReedemSlippage = _usdcReedemSlippage;
            usdcConversionThreshold = _usdcConversionThreshold;
            stakingManager = IGlpStakingManager(_stakingManager);
        } else revert GYS_INVALID_SETTER_VALUES();

        emit GmxParamsUpdated(_stakingManager, _usdcReedemSlippage, _usdcConversionThreshold);
    }

    /// @notice grants one time max allowance to various third parties
    function grantAllowances() public override onlyOwner {
        _grantBaseAllowances();

        asset.approve(address(glpManager), type(uint256).max);
        asset.approve(address(stakingManager), type(uint256).max);

        rageSettlementToken.approve(address(glpManager), type(uint256).max);
        rageSettlementToken.approve(address(stakingManager), type(uint256).max);
    }

    /// @notice triggered from the afterDeposit hook, transfers sGLP(LP token) to staking manager
    /// @param amount amount of LP tokens
    function _afterDepositYield(uint256 amount) internal override {
        stakingManager.deposit(amount, address(this));
    }

    /// @notice triggered from beforeWithdraw , withdraw sGLP(LP token) from staking manager
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

    /* solhint-disable no-empty-blocks */
    function _harvestFees() internal override {
        /// @dev NO OP but not removed because of backwards compatibility with BaseVault
    }

    /// @param amount amount of LP tokens
    function _stake(uint256 amount) internal override {
        /// @dev NO OP but not removed because of backwards compatibility with BaseVault
    }

    /// @notice staked LP tokens (sGLP) balance available
    function _stakedAssetBalance() internal view override returns (uint256) {
        return fsGlp.balanceOf(address(this)) + stakingManager.maxRedeem(address(this));
    }

    /// @notice withdraws LP tokens from gauge, sells LP token for rageSettlementToken
    /// @param usdcAmountDesired amount of USDC desired
    function _convertAssetToSettlementToken(uint256 usdcAmountDesired) internal override returns (uint256 usdcAmount) {
        /// @dev if usdcAmountDesired < 10, then there is precision issue in gmx contracts while redeeming for usdg
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

    /// @notice allows to redeem shares for tokens available on gmx
    /// @param token address of required output token
    /// @param shares amount of shares to redeem
    /// @param minTokenOut minimum amount of token required
    /// @param receiver address of the receiver
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

    /// @notice allows to withdraw amount for tokens available on gmx
    /// @param token address of required output token
    /// @param _sGLP amount of sGLP(asset) to withdraw
    /// @param minTokenOut minimum amount of token required
    /// @param receiver address of the receiver
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
