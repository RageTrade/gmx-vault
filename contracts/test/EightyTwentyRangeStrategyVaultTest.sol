// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { IClearingHouseStructures } from '@ragetrade/core/contracts/interfaces/clearinghouse/IClearingHouseStructures.sol';

import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';

import { BaseVault } from '../base/BaseVault.sol';
import { EightyTwentyRangeStrategyVault } from '../rangeStrategy/EightyTwentyRangeStrategyVault.sol';

import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { console } from 'hardhat/console.sol';

contract EightyTwentyRangeStrategyVaultTest is EightyTwentyRangeStrategyVault {
    using FullMath for uint256;

    /* solhint-disable no-empty-blocks */
    uint256 public priceX128;
    address public settlementTokenTreasury;

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        uint32 _ethPoolId
    ) BaseVault(_asset, _name, _symbol, _ethPoolId) {}

    function _stake(uint256 amount) internal virtual override {}

    function initialize(
        address _owner,
        address _rageClearingHouse,
        address _rageCollateralToken,
        address _rageBaseToken,
        uint16 _closePositionSlippageSqrtToleranceBps,
        uint16 _resetPositionThresholdBps,
        uint256 _priceX128,
        address _settlementTokenTreasury,
        uint64 _minNotionalPositionToCloseThreshold
    ) external initializer {
        __BaseVault_init(_owner, _rageClearingHouse, _rageCollateralToken, _rageBaseToken);
        __EightyTwentyRangeStrategyVault_init(
            _closePositionSlippageSqrtToleranceBps,
            _resetPositionThresholdBps,
            _minNotionalPositionToCloseThreshold
        );
        priceX128 = _priceX128;
        settlementTokenTreasury = _settlementTokenTreasury;
    }

    function setKeeper(address _keeper) external {
        keeper = _keeper;
    }

    function _harvestFees() internal virtual override {}

    function getPriceX128() public view virtual override returns (uint256) {
        return priceX128;
    }

    function getMarketValue(uint256 amount) public view virtual override returns (uint256 marketValue) {
        marketValue = amount.mulDiv(priceX128, FixedPoint128.Q128);
    }

    //TODO: handle update of yield tokens based on their value along with update in settlement token
    // To convert yield token into USDC to cover loss on rage trade
    function _withdrawBase(uint256 amount) internal virtual override {
        rageBaseToken.transferFrom(settlementTokenTreasury, address(this), amount);
        asset.transfer(settlementTokenTreasury, amount.mulDiv(FixedPoint128.Q128, priceX128));
    }

    // To deposit the USDC profit made from rage trade into yield protocol
    function _depositBase(uint256 amount) internal virtual override {
        asset.transferFrom(settlementTokenTreasury, address(this), amount.mulDiv(FixedPoint128.Q128, priceX128));
        rageBaseToken.transfer(settlementTokenTreasury, amount);
    }

    function _stakedAssetBalance() internal view virtual override returns (uint256) {}

    function _afterDepositYield(uint256 amount) internal virtual override {}

    function _beforeWithdrawYield(uint256 amount) internal virtual override {}

    /* solhint-enable no-empty-blocks */

    function getLiquidityChangeParamsOnRebalance(int256 vaultMarketValue)
        external
        returns (IClearingHouseStructures.LiquidityChangeParams[2] memory liquidityChangeParamList)
    {
        return _getLiquidityChangeParamsOnRebalance(vaultMarketValue);
    }

    function setYieldTokenPriceX128(uint256 _priceX128) external {
        priceX128 = _priceX128;
    }
}
