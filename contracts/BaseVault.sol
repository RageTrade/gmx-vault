// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;
import { IBaseVault } from './interfaces/IBaseVault.sol';
import { IBaseYeildStrategy } from './interfaces/IBaseYeildStrategy.sol';
import { IBaseRangeStrategy } from './interfaces/IBaseRangeStrategy.sol';

import { ERC4626 } from '@rari-capital/solmate/src/mixins/ERC4626.sol';
import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { IERC20 } from '@openzeppelin/contracts/interfaces/IERC20.sol';
import { IClearingHouse } from '@ragetrade/contracts/contracts/interfaces/IClearingHouse.sol';
import { SafeCast } from './libraries/SafeCast.sol';
import { CollateralToken } from './CollateralToken.sol';
import { RTokenLib } from '@ragetrade/contracts/contracts/libraries/RTokenLib.sol';
import { SignedMath } from '@ragetrade/contracts/contracts/libraries/SignedMath.sol';

contract BaseVault is IBaseVault, ERC4626, IBaseYeildStrategy, OwnableUpgradeable {
    using SafeCast for uint256;
    using SignedMath for int256;

    //TODO: Make relevant things immutable
    IClearingHouse public rageClearingHouse;
    uint256 public rageAccountNo;
    CollateralToken public rageCollateralToken;
    uint32 public immutable VWETH_TRUNCATED_ADDRESS;

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        address _vWethAddress
    ) ERC4626(_asset, _name, _symbol) {
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

    function settleProfitAndCollateral() internal {
        // Settle net profit made from ranges and deposit/withdraw profits in USDC
        int256 netProfit = rageClearingHouse.getAccountNetProfit(rageAccountNo);
        if (netProfit > 0) {
            //If net profit > 0 withdraw USDC and convert USDC into LP tokens
            rageClearingHouse.updateProfit(rageAccountNo, -1 * netProfit);
            depositUsdc(uint256(netProfit));
        } else {
            //If net profit > 0 convert LP tokens into USDC and deposit USDC to cover loss
            withdrawUsdc(uint256(-1 * netProfit));
            rageClearingHouse.updateProfit(rageAccountNo, -1 * netProfit);
        }

        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        int256 vaultMarketValue = getMarketValue(asset.balanceOf(address(this))).toInt256();
        IClearingHouse.DepositTokenView memory stablecoinDeposit;
        {
            IClearingHouse.DepositTokenView[] memory deposits;
            (, , deposits, ) = rageClearingHouse.getAccountView(rageAccountNo);
            stablecoinDeposit = deposits[0];
        }
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
        } else {
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

        //Step-0 Check if the rebalance can go through (time and threshold based checks)

        //Step-1 Find current value of collateral and ranges -> Profit / Loss from the ranges
        //Step-2 Mint or burn dummy stablecoins
        //Step-3 Payback the due in USDC
        settleProfitAndCollateral();

        //Step-4 Find the ranges and amount of liquidity to put in each
        IClearingHouse.LiquidityChangeParams[] memory liquidityChangeParamList = getLiquidityChangeParams();

        for (uint8 i = 0; i < liquidityChangeParamList.length; i++) {
            rageClearingHouse.updateRangeOrder(rageAccountNo, VWETH_TRUNCATED_ADDRESS, liquidityChangeParamList[i]);
        }
        //Step-5 Rebalance
    }

    function rebalanceProfitAndCollateral() external {
        //Rebalance collateral and dummy stable coins representing the collateral
        //Update protocol and management fee accumulated
        settleProfitAndCollateral();
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

    function withdrawUsdc(uint256 balance) internal returns (uint256 marketValue) {}

    function depositUsdc(uint256 balance) internal returns (uint256 marketValue) {}

    /*
        RANGE STRATEGY
    */

    function getLiquidityChangeParams()
        internal
        returns (IClearingHouse.LiquidityChangeParams[] memory liquidityChangeParamList)
    {
        liquidityChangeParamList[0] = IClearingHouse.LiquidityChangeParams(
            -100,
            100,
            10000,
            0,
            0,
            false,
            IClearingHouse.LimitOrderType.NONE
        );
    }
}
