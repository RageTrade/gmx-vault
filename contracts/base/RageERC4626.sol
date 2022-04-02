// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import { ERC4626 } from '@rari-capital/solmate/src/mixins/ERC4626.sol';
import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';
import { SafeTransferLib } from '@rari-capital/solmate/src/utils/SafeTransferLib.sol';

abstract contract RageERC4626 is ERC4626 {
    using SafeTransferLib for ERC20;

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol
    ) ERC4626(_asset, _name, _symbol) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function deposit(uint256 amount, address to) public virtual override returns (uint256 shares) {
        _beforeShareTransfer();
        return super.deposit(amount, to);
    }

    function mint(uint256 shares, address to) public virtual override returns (uint256 amount) {
        _beforeShareTransfer();

        amount = previewMint(shares); // No need to check for rounding error, previewMint rounds up.

        // Need to transfer before minting or ERC777s could reenter.
        asset.safeTransferFrom(msg.sender, address(this), amount);

        _mint(to, shares);

        emit Deposit(msg.sender, to, amount, shares);

        afterDeposit(amount, shares);
    }

    function withdraw(
        uint256 amount,
        address to,
        address from
    ) public override returns (uint256 shares) {
        _beforeShareTransfer();
        shares = previewWithdraw(amount); // No need to check for rounding error, previewWithdraw rounds up.

        if (msg.sender != from) {
            uint256 allowed = allowance[from][msg.sender]; // Saves gas for limited approvals.
            if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - shares;
        }

        // Additional cap on withdraw to ensure the position closed does not breach slippage tolerance
        // In case tolerance is reached only partial withdraw is executed
        uint256 updatedAmount = beforeBurn(amount);
        if (updatedAmount != amount) {
            amount = updatedAmount;
            shares = previewWithdraw(updatedAmount);
        }

        beforeWithdraw(amount, shares);

        _burn(from, shares);

        emit Withdraw(msg.sender, to, from, amount, shares);

        asset.safeTransfer(to, amount);
    }

    function redeem(
        uint256 shares,
        address to,
        address from
    ) public override returns (uint256 amount) {
        _beforeShareTransfer();

        if (msg.sender != from) {
            uint256 allowed = allowance[from][msg.sender]; // Saves gas for limited approvals.
            if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - shares;
        }

        // Check for rounding error since we round down in previewRedeem.
        require((amount = previewRedeem(shares)) != 0, 'ZERO_ASSETS');

        //Additional cap on withdraw to ensure the position closed does not breach slippage tolerance
        //In case tolerance is reached only partial withdraw is executed
        uint256 updatedAmount = beforeBurn(amount);
        if (updatedAmount != amount) {
            amount = updatedAmount;
            shares = previewWithdraw(updatedAmount);
        }

        beforeWithdraw(amount, shares);

        _burn(from, shares);

        emit Withdraw(msg.sender, to, from, amount, shares);

        asset.safeTransfer(to, amount);
    }

    function _beforeShareTransfer() internal virtual;

    function beforeBurn(uint256 amount) internal virtual returns (uint256 updatedAmount);
}
