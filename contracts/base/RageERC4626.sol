// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import { IBaseVault } from 'contracts/interfaces/IBaseVault.sol';

import { ERC4626Upgradeable } from '../utils/ERC4626Upgradeable.sol';

abstract contract RageERC4626 is ERC4626Upgradeable {
    using SafeERC20 for IERC20Metadata;

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
        (uint256 adjustedAssets, ) = Logic.simulateBeforeWithdraw(address(this), totalAssets(), assets);

        return supply == 0 ? adjustedAssets : adjustedAssets.mulDivUp(supply, totalAssets());
    }

    function previewRedeem(uint256 shares) public view virtual override returns (uint256) {
        uint256 assets = convertToAssets(shares);
        (uint256 adjustedAssets, ) = Logic.simulateBeforeWithdraw(address(this), totalAssets(), assets);
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
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        (uint256 adjustedAmount, int256 tokensToTrade) = Logic.simulateBeforeWithdraw(
            address(this),
            totalAssets(),
            amount
        );

        shares = supply == 0 ? adjustedAmount : adjustedAmount.mulDivUp(supply, totalAssets());

        beforeWithdrawClosePosition(tokensToTrade);

        if (msg.sender != from) {
            uint256 allowed = allowance(from, msg.sender); // Saves gas for limited approvals.

            if (allowed != type(uint256).max) _approve(from, msg.sender, allowed - shares);
        }

        beforeWithdraw(adjustedAmount, shares);

        _burn(from, shares);

        emit Withdraw(msg.sender, to, from, adjustedAmount, shares);

        asset.safeTransfer(to, adjustedAmount);
    }

    function redeem(
        uint256 shares,
        address to,
        address from
    ) public override returns (uint256 amount) {
        _beforeShareAllocation();

        if (msg.sender != from) {
            uint256 allowed = allowance(from, msg.sender); // Saves gas for limited approvals.
            if (allowed != type(uint256).max) _approve(from, msg.sender, allowed - shares);
        }

        // Check for rounding error since we round down in previewRedeem.
        uint256 assets = convertToAssets(shares);
        int256 tokensToTrade;
        (amount, tokensToTrade) = Logic.simulateBeforeWithdraw(address(this), totalAssets(), assets);
        require(amount != 0, 'ZERO_ASSETS');

        //Additional cap on withdraw to ensure the position closed does not breach slippage tolerance
        //In case tolerance is reached only partial withdraw is executed

        beforeWithdrawClosePosition(tokensToTrade);

        beforeWithdraw(amount, shares);

        _burn(from, shares);

        emit Withdraw(msg.sender, to, from, amount, shares);

        asset.safeTransfer(to, amount);
    }

    function maxDeposit(address) public view virtual override returns (uint256) {
        return IBaseVault(address(this)).depositCap() - totalAssets();
    }

    function maxMint(address) public view virtual override returns (uint256) {
        return convertToShares(maxDeposit(address(0)));
    }

    function _beforeShareAllocation() internal virtual;

    function beforeWithdrawClosePosition(int256 tokensToTrade) internal virtual;
}
