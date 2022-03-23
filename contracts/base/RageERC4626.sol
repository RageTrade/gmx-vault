// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import { ERC4626 } from '@rari-capital/solmate/src/mixins/ERC4626.sol';
import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';
import { SafeTransferLib } from '@rari-capital/solmate/src/utils/SafeTransferLib.sol';

import { console } from 'hardhat/console.sol';

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

        emit Deposit(msg.sender, to, amount);

        afterDeposit(amount);
    }

    function withdraw(
        uint256 amount,
        address to,
        address from
    ) public virtual override returns (uint256 shares) {
        _beforeShareTransfer();
        return super.withdraw(amount, to, from);
    }

    function redeem(
        uint256 shares,
        address to,
        address from
    ) public virtual override returns (uint256 amount) {
        _beforeShareTransfer();
        return super.redeem(shares, to, from);
    }

    function _beforeShareTransfer() internal virtual;
}
