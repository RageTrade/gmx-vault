// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;
import { IBaseVault } from '../interfaces/IBaseVault.sol';
import { IBaseYeildStrategy } from '../interfaces/IBaseYeildStrategy.sol';

import { ERC4626 } from '@rari-capital/solmate/src/mixins/ERC4626.sol';
import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import { IClearingHouse, IVToken } from '@ragetrade/contracts/contracts/interfaces/IClearingHouse.sol';

import { SafeCast } from '../libraries/SafeCast.sol';
import { CollateralToken } from '../CollateralToken.sol';
import { RTokenLib } from '@ragetrade/contracts/contracts/libraries/RTokenLib.sol';
import { SignedMath } from '@ragetrade/contracts/contracts/libraries/SignedMath.sol';

import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

abstract contract BaseVault is IBaseVault, ERC4626, IBaseYeildStrategy, OwnableUpgradeable {
    using SafeCast for uint256;
    using SafeCast for int256;
    using SignedMath for int256;

    //TODO: Make relevant things immutable
    IClearingHouse public rageClearingHouse;
    uint256 public rageAccountNo;
    CollateralToken public rageCollateralToken;
    address public immutable VWETH_ADDRESS;
    uint32 public immutable VWETH_TRUNCATED_ADDRESS;
    IERC20Metadata public rageBaseToken;

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
        address _rageCollateralToken,
        address _rageBaseToken
    ) internal onlyInitializing {
        __Ownable_init();
        transferOwnership(_owner);
        rageClearingHouse = IClearingHouse(_rageClearingHouse);
        rageAccountNo = rageClearingHouse.createAccount();
        rageCollateralToken = CollateralToken(_rageCollateralToken);
        rageBaseToken = IERC20Metadata(_rageBaseToken);
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
            depositBase(uint256(netProfit));
        } else if (netProfit < 0) {
            //If net profit > 0 convert LP tokens into USDC and deposit USDC to cover loss
            withdrawBase(uint256(-1 * netProfit));
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
        YEILD STRATEGY
    */

    function depositTokens() external virtual;

    function withdrawTokens() external virtual;

    function harvestFees() external virtual;

    function getPriceX128() public view virtual returns (uint256 price);

    function getMarketValue(uint256 balance) public view virtual returns (uint256 marketValue);

    //To convert yeild token into USDC to cover loss on rage trade
    function withdrawBase(uint256 balance) internal virtual;

    //To deposit the USDC profit made from rage trade into yeild protocol
    function depositBase(uint256 balance) internal virtual;

    //To rebalance multiple collateral token
    function rebalanceCollateral() internal virtual;

    /*
        RANGE STRATEGY
    */

    function getLiquidityChangeParams(
        IClearingHouse.VTokenPositionView memory vTokenPosition,
        IClearingHouse.RageTradePool memory rageTradePool,
        int256 vaultMarketValue
    ) internal view virtual returns (IClearingHouse.LiquidityChangeParams[4] memory liquidityChangeParamList);
}
