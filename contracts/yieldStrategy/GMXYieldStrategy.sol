// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { EightyTwentyRangeStrategyVault } from '../rangeStrategy/EightyTwentyRangeStrategyVault.sol';

contract GMXYieldStrategy is EightyTwentyRangeStrategyVault {
    /* solhint-disable var-name-mixedcase */
    uint256 public constant MAX_BPS = 10_000;

    /* solhint-disable var-name-mixedcase */
    uint256 public FEE = 1000;

    // TODO: update initialize
    // function initialize(CurveYieldStrategyInitParams memory curveYieldStrategyInitParams) external initializer {
    //     __CurveYieldStrategy_init(curveYieldStrategyInitParams);
    // }

    /* solhint-disable-next-line func-name-mixedcase */
    // function __CurveYieldStrategy_init(CurveYieldStrategyInitParams memory params) internal onlyInitializing {
    //     __EightyTwentyRangeStrategyVault_init(params.eightyTwentyRangeStrategyVaultInitParams);
    //     usdt = params.usdt;
    //     usdc = params.usdc;
    //     weth = params.weth;
    //     gauge = params.gauge;
    //     crvToken = params.crvToken;
    //     uniV3Router = params.uniV3Router;
    //     triCryptoPool = params.tricryptoPool;
    //     lpPriceHolder = params.lpPriceHolder;
    // }

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
    function _afterDepositYield(uint256 amount) internal override {}

    /// @notice triggered from beforeWithdraw hook
    /// @param amount amount of LP tokens
    function _beforeWithdrawYield(uint256 amount) internal override {}

    /// @notice sells settlementToken for LP tokens and then stakes LP tokens
    /// @param amount amount of settlementToken
    function _convertSettlementTokenToAsset(uint256 amount) internal override {}

    /// @notice claims the accumulated CRV rewards from the gauge, sells CRV rewards for LP tokens and stakes LP tokens
    function _harvestFees() internal override {}

    /// @notice stakes LP tokens (i.e deposits into reward gauge)
    /// @param amount amount of LP tokens
    function _stake(uint256 amount) internal override {}

    /// @notice total LP tokens staked in the curve rewards gauge
    function _stakedAssetBalance() internal view override returns (uint256) {}

    /// @notice withdraws LP tokens from gauge, sells LP token for settlementToken
    /// @param amount amount of LP tokens
    function _convertAssetToSettlementToken(uint256 amount) internal override returns (uint256 usdcAmount) {}

    /// @notice compute notional value for given amount of LP tokens
    /// @param amount amount of LP tokens
    function getMarketValue(uint256 amount) public view override returns (uint256 marketValue) {}

    /// @notice gives x128 price of 1 tricrypto LP token
    function getPriceX128() public view override returns (uint256 priceX128) {}
}
