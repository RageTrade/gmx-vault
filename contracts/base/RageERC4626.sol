// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import { IBaseVault } from 'contracts/interfaces/IBaseVault.sol';

import { Logic } from '../libraries/Logic.sol';
import { ERC4626Upgradeable } from '../utils/ERC4626Upgradeable.sol';
import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

abstract contract RageERC4626 is ERC4626Upgradeable {
    using SafeERC20 for IERC20Metadata;
    using FixedPointMathLib for uint256;

    struct RageERC4626InitParams {
        IERC20Metadata asset;
        string name;
        string symbol;
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __RageERC4626_init(RageERC4626InitParams memory params) internal {
        __ERC4626Upgradeable_init(params.asset, params.name, params.symbol);
    }

    function previewWithdraw(uint256 assets) public view virtual override returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        uint256 adjustedAssets = Logic.simulateBeforeWithdraw(address(this), totalAssets(), assets);

        return supply == 0 ? adjustedAssets : adjustedAssets.mulDivUp(supply, totalAssets());
    }

    function previewRedeem(uint256 shares) public view virtual override returns (uint256) {
        uint256 assets = convertToAssets(shares);
        uint256 adjustedAssets = Logic.simulateBeforeWithdraw(address(this), totalAssets(), assets);

        return adjustedAssets;
    }

    function deposit(uint256 amount, address to) public virtual override returns (uint256 shares) {
        _beforeShareAllocation();
        shares = super.deposit(amount, to);
    }

    function mint(uint256 shares, address to) public virtual override returns (uint256 amount) {
        _beforeShareAllocation();
        amount = super.mint(shares, to);
    }

    function withdraw(
        uint256 amount,
        address to,
        address from
    ) public override returns (uint256 shares) {
        _beforeShareAllocation();
        shares = super.withdraw(amount, to, from);
        beforeWithdrawClosePosition(amount);
    }

    function redeem(
        uint256 shares,
        address to,
        address from
    ) public override returns (uint256 amount) {
        _beforeShareAllocation();
        uint256 amountBefore = convertToAssets(shares);
        amount = super.redeem(shares, to, from);
        beforeWithdrawClosePosition(amountBefore);
    }

    function maxDeposit(address) public view virtual override returns (uint256) {
        return IBaseVault(address(this)).depositCap() - totalAssets();
    }

    function maxMint(address) public view virtual override returns (uint256) {
        return convertToShares(maxDeposit(address(0)));
    }

    function _beforeShareAllocation() internal virtual;

    function beforeWithdrawClosePosition(uint256 amount) internal virtual returns (uint256 updatedAmount);
}
