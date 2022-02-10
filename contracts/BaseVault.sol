// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;
import { IBaseVault } from './interfaces/IBaseVault.sol';
import { IBaseYeildStrategy } from './interfaces/IBaseYeildStrategy.sol';
import { IBaseRangeStrategy } from './interfaces/IBaseRangeStrategy.sol';

import { ERC4626 } from '@rari-capital/solmate/src/mixins/ERC4626.sol';
import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { IERC20 } from '@openzeppelin/contracts/interfaces/IERC20.sol';
import { IClearingHouse, IVToken, IUniswapV3Pool } from '@ragetrade/contracts/contracts/interfaces/IClearingHouse.sol';
import { UniswapV3PoolHelper } from '@ragetrade/contracts/contracts/libraries/UniswapV3PoolHelper.sol';

import { SignedFullMath } from '@ragetrade/contracts/contracts/libraries/SignedFullMath.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { FixedPoint96 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint96.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

import { SafeCast } from './libraries/SafeCast.sol';
import { CollateralToken } from './CollateralToken.sol';
import { RTokenLib } from '@ragetrade/contracts/contracts/libraries/RTokenLib.sol';
import { SignedMath } from '@ragetrade/contracts/contracts/libraries/SignedMath.sol';

import { TickMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/TickMath.sol';

contract BaseVault is IBaseVault, ERC4626, IBaseYeildStrategy, OwnableUpgradeable {
    using SafeCast for uint256;
    using SafeCast for uint128;
    using SafeCast for int256;
    using SignedMath for int256;
    using SignedFullMath for int256;
    using FullMath for uint256;
    using UniswapV3PoolHelper for IUniswapV3Pool;

    //TODO: Make relevant things immutable
    IClearingHouse public rageClearingHouse;
    uint256 public rageAccountNo;
    CollateralToken public rageCollateralToken;
    address public immutable VWETH_ADDRESS;
    uint32 public immutable VWETH_TRUNCATED_ADDRESS;

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        address _vWethAddress
    ) ERC4626(_asset, _name, _symbol) {
        VWETH_ADDRESS = _vWethAddress;
        VWETH_TRUNCATED_ADDRESS = RTokenLib.truncate(_vWethAddress);
    }

    function __BaseVault_init(
        address _owner,
        address _rageClearingHouse,
        address _rageCollateralToken
    ) external initializer {
        __Ownable_init();
        transferOwnership(_owner);
        rageClearingHouse = IClearingHouse(_rageClearingHouse);
        rageAccountNo = rageClearingHouse.createAccount();
        rageCollateralToken = CollateralToken(_rageCollateralToken);

        //Give rageClearingHouse full allowance of rageCollateralToken and usdc
    }

    function getVaultMarketValue() public view returns (int256 vaultMarketValue) {
        vaultMarketValue = rageClearingHouse.getAccountNetProfit(rageAccountNo);
        vaultMarketValue += (getMarketValue(asset.balanceOf(address(this)))).toInt256();
    }

    function settleProfitAndCollateral(IClearingHouse.DepositTokenView[] memory deposits, int256 vaultMarketValue)
        internal
    {
        // Settle net profit made from ranges and deposit/withdraw profits in USDC
        int256 netProfit = rageClearingHouse.getAccountNetProfit(rageAccountNo);
        if (netProfit > 0) {
            //If net profit > 0 withdraw USDC and convert USDC into LP tokens
            rageClearingHouse.updateProfit(rageAccountNo, -1 * netProfit);
            depositUsdc(uint256(netProfit));
        } else if (netProfit < 0) {
            //If net profit > 0 convert LP tokens into USDC and deposit USDC to cover loss
            withdrawUsdc(uint256(-1 * netProfit));
            rageClearingHouse.updateProfit(rageAccountNo, -1 * netProfit);
        }

        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled

        IClearingHouse.DepositTokenView memory stablecoinDeposit = deposits[0];
        assert(stablecoinDeposit.rTokenAddress == address(rageCollateralToken));
        int256 vaultMarketValueDiff = vaultMarketValue - stablecoinDeposit.balance.toInt256();
        //Settlement basis market value difference
        settleCollateral(vaultMarketValueDiff);
    }

    function settleCollateral(int256 vaultMarketValueDiff) internal {
        uint256 vaultMarketValueDiffAbs = vaultMarketValueDiff.absUint();
        if (vaultMarketValueDiff > 0) {
            // Mint collateral coins and deposit into rage trade
            assert(rageCollateralToken.balanceOf(address(this)) > vaultMarketValueDiffAbs);
            rageClearingHouse.addMargin(
                rageAccountNo,
                RTokenLib.truncate(address(rageCollateralToken)),
                vaultMarketValueDiffAbs
            );
        } else if (vaultMarketValueDiff < 0) {
            // Withdraw rage trade deposits
            rageClearingHouse.removeMargin(
                rageAccountNo,
                RTokenLib.truncate(address(rageCollateralToken)),
                vaultMarketValueDiffAbs
            );
        }
    }

    function rebalanceRanges() external {
        //Rebalance ranges based on the parameters passed
        //TODO: Use multicall instead of directly executing txns with rageClearingHouse
        IClearingHouse.DepositTokenView[] memory deposits;
        IClearingHouse.VTokenPositionView[] memory vTokenPositions;
        //Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, , deposits, vTokenPositions) = rageClearingHouse.getAccountView(rageAccountNo);
        // (, uint256 virtualPriceX128) = rageClearingHouse.getTwapSqrtPricesForSetDuration(IVToken(VWETH_ADDRESS));
        IClearingHouse.RageTradePool memory rageTradePool = rageClearingHouse.pools(IVToken(VWETH_ADDRESS));

        //First token should be VWETH and there should be only one token used (hence next address should be 0)
        assert(vTokenPositions[0].vTokenAddress == VWETH_ADDRESS);
        assert(vTokenPositions[1].vTokenAddress == address(0));

        int256 vaultMarketValue = getMarketValue(asset.balanceOf(address(this))).toInt256();

        //Step-1 Find current value of collateral and ranges -> Profit / Loss from the ranges
        //Step-2 Mint or burn dummy stablecoins
        //Step-3 Payback the due in USDC
        settleProfitAndCollateral(deposits, vaultMarketValue);

        //Step-4 Find the ranges and amount of liquidity to put in each
        IClearingHouse.LiquidityChangeParams[4] memory liquidityChangeParamList = getLiquidityChangeParams(
            vTokenPositions[0],
            rageTradePool,
            vaultMarketValue
        );

        for (uint8 i = 0; i < liquidityChangeParamList.length; i++) {
            rageClearingHouse.updateRangeOrder(rageAccountNo, VWETH_TRUNCATED_ADDRESS, liquidityChangeParamList[i]);
        }
        //Step-5 Rebalance
    }

    function rebalanceProfitAndCollateral() external {
        //Rebalance collateral and dummy stable coins representing the collateral
        //Update protocol and management fee accumulated
        IClearingHouse.DepositTokenView[] memory deposits;
        IClearingHouse.VTokenPositionView[] memory vTokenPositions;

        //Step-0 Check if the rebalance can go through (time and threshold based checks)
        (, , deposits, vTokenPositions) = rageClearingHouse.getAccountView(rageAccountNo);
        //First token should be VWETH and there should be only one token used (hence next address should be 0)
        assert(vTokenPositions[0].vTokenAddress == VWETH_ADDRESS);
        assert(vTokenPositions[1].vTokenAddress == address(0));

        int256 vaultMarketValue = getMarketValue(asset.balanceOf(address(this))).toInt256();

        settleProfitAndCollateral(deposits, vaultMarketValue);
        rebalanceCollateral();
    }

    function unrealizedBalance() internal view returns (uint256) {
        //Returns the unrealized pnl which includes pnl from ranges (FP+Fee+RangeIL) and Yeild from the yeild protocol
        //This is divided by the asset value to arrive at the number of unrealized asset tokens
        //This might be away from the actual value
    }

    function totalAssets() public view override returns (uint256) {
        return asset.balanceOf(address(this)) + unrealizedBalance();
    }

    /*
        BASE YEILD STRATEGY
    */

    function depositTokens() external {}

    function withdrawTokens() external {}

    function harvestFees() external {}

    function getPrice() external {}

    function getMarketValue(uint256 balance) public view returns (uint256 marketValue) {}

    function withdrawUsdc(uint256 balance) internal returns (uint256 marketValue) {
        //To convert yeild token into USDC to cover loss on rage trade
    }

    function depositUsdc(uint256 balance) internal returns (uint256 marketValue) {
        //To deposit the USDC profit made from rage trade into yeild protocol
    }

    function rebalanceCollateral() internal {
        //To rebalance multiple collateral token
    }

    /*
        RANGE STRATEGY
    */

    function getLiquidityChangeParams(
        IClearingHouse.VTokenPositionView memory vTokenPosition,
        IClearingHouse.RageTradePool memory rageTradePool,
        int256 vaultMarketValue
    ) internal view returns (IClearingHouse.LiquidityChangeParams[4] memory liquidityChangeParamList) {
        //Get net token position
        //Remove reabalance
        //Add new rebalance range
        //Update base range liquidity
        int256 netPosition = rageClearingHouse.getNetTokenPosition(rageAccountNo, VWETH_TRUNCATED_ADDRESS);
        uint160 twapSqrtPriceX96 = rageTradePool.vPool.twapSqrtPrice(rageTradePool.settings.twapDuration);

        uint8 liqCount = 0;
        if (netPosition != 0) {
            //Rebalance Range
            uint160 sqrtPriceLowerX96;
            uint160 sqrtPriceUpperX96;
            int128 liquidityDelta;
            if (netPosition > 0) {
                sqrtPriceLowerX96 = twapSqrtPriceX96;
                sqrtPriceUpperX96 = uint256(twapSqrtPriceX96).mulDiv(104880885, 1e8).toUint160(); //multiplication by sqrt(1.1)

                //liquidityDelta = netTokenPositionAccrued * sqrtPCurrent * (sqrt(1+r) +1+r)/r
                //for r=.1 -> (sqrt(1+r) +1+r)/r = 21.48808848
                liquidityDelta = netPosition
                    .mulDiv(int256(2148808848), 1e8)
                    .mulDiv(twapSqrtPriceX96, FixedPoint96.Q96)
                    .toInt128();
            } else {
                sqrtPriceLowerX96 = uint256(twapSqrtPriceX96).mulDiv(94868330, 1e8).toUint160(); //multiplication by sqrt(.9)
                sqrtPriceUpperX96 = twapSqrtPriceX96;

                //liquidityDelta = -netTokenPositionAccrued * sqrtPCurrent * (sqrt(1-r) +1-r)/r
                //for r=.1 -> (sqrt(1-r) +1-r)/r = 18.48683298
                liquidityDelta = netPosition
                    .mulDiv(int256(1848683298), 1e8)
                    .mulDiv(twapSqrtPriceX96, FixedPoint96.Q96)
                    .toInt128();
            }

            liquidityChangeParamList[liqCount] = IClearingHouse.LiquidityChangeParams(
                TickMath.getTickAtSqrtRatio(sqrtPriceLowerX96),
                TickMath.getTickAtSqrtRatio(sqrtPriceUpperX96),
                liquidityDelta,
                0,
                0,
                false,
                IClearingHouse.LimitOrderType.NONE
            );
            liqCount++;
        }

        {
            //Base Range

            //LiquidityDelta = (vaultMarketValue / (sqrtPCurrent * MMargin) - abs(netTokenPositionAccrued)* sqrtPCurrent)* (sqrt(1-b) +1-b)/b
            //for b=0.4 (sqrt(1-b) +1-b)/b=

            int128 liquidityDelta;
            {
                int256 liquidityDeltaTerm1 = vaultMarketValue.mulDiv(FixedPoint96.Q96, twapSqrtPriceX96).mulDiv(
                    1e4,
                    rageTradePool.settings.maintainanceMarginRatio
                );
                int256 liquidityDeltaTerm2 = netPosition.abs().mulDiv(twapSqrtPriceX96, FixedPoint96.Q96); //multiplication by (sqrt(1-b) +1-b)/b

                liquidityDelta = (liquidityDeltaTerm1 - liquidityDeltaTerm2).mulDiv(int256(343649167), 1e8).toInt128();
            }

            uint160 sqrtPriceLowerX96 = uint256(twapSqrtPriceX96).mulDiv(77459667, 1e8).toUint160(); //multiplication by sqrt(0.6)
            uint160 sqrtPriceUpperX96 = uint256(twapSqrtPriceX96).mulDiv(118321596, 1e8).toUint160(); //multiplication by sqrt(1.4)

            liquidityChangeParamList[liqCount] = IClearingHouse.LiquidityChangeParams(
                TickMath.getTickAtSqrtRatio(sqrtPriceLowerX96),
                TickMath.getTickAtSqrtRatio(sqrtPriceUpperX96),
                liquidityDelta,
                0,
                0,
                false,
                IClearingHouse.LimitOrderType.NONE
            );
            liqCount++;
        }
        {
            //Remove previous ranges
            IClearingHouse.LiquidityPositionView[] memory liquidityPositions = vTokenPosition.liquidityPositions;
            for (uint8 i = 0; i < liquidityPositions.length; ++i) {
                assert(liquidityPositions[i].tickLower != 0);
                assert(liquidityPositions[i].tickUpper != 0);
                assert(liquidityPositions[i].liquidity != 0);

                liquidityChangeParamList[liqCount] = IClearingHouse.LiquidityChangeParams(
                    liquidityPositions[i].tickLower,
                    liquidityPositions[i].tickUpper,
                    -(liquidityPositions[i].liquidity.toInt128()),
                    0,
                    0,
                    false,
                    IClearingHouse.LimitOrderType.NONE
                );
                liqCount++;
            }
        }
    }
}
