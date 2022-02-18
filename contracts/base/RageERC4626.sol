// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import { ERC4626 } from '@rari-capital/solmate/src/mixins/ERC4626.sol';
import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';
import { SafeTransferLib } from '@rari-capital/solmate/src/utils/SafeTransferLib.sol';
import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

/// @notice Minimal ERC4646 tokenized vault implementation.
/// @author Solmate (https://github.com/Rari-Capital/solmate/blob/main/src/mixins/ERC4626.sol)
abstract contract RageERC4626 is ERC4626 {
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol
    ) ERC4626(_asset, _name, _symbol) {}

    /*///////////////////////////////////////////////////////////////
                        DEPOSIT/WITHDRAWAL LOGIC
    //////////////////////////////////////////////////////////////*/

    function deposit(uint256 amount, address to) public virtual override returns (uint256 shares) {
        beforeShareTransfer();
        // Check for rounding error since we round down in previewDeposit.
        require((shares = previewDeposit(amount)) != 0, 'ZERO_SHARES');

        _mint(to, shares);

        emit Deposit(msg.sender, to, amount);

        asset.safeTransferFrom(msg.sender, address(this), amount);

        afterDeposit(amount);
    }

    function mint(uint256 shares, address to) public virtual override returns (uint256 amount) {
        beforeShareTransfer();

        _mint(to, amount = previewMint(shares)); // No need to check for rounding error, previewMint rounds up.

        emit Deposit(msg.sender, to, amount);

        asset.safeTransferFrom(msg.sender, address(this), amount);

        afterDeposit(amount);
    }

    function withdraw(
        uint256 amount,
        address to,
        address from
    ) public virtual override returns (uint256 shares) {
        beforeShareTransfer();

        shares = previewWithdraw(amount); // No need to check for rounding error, previewWithdraw rounds up.

        uint256 allowed = allowance[from][msg.sender]; // Saves gas for limited approvals.

        if (msg.sender != from && allowed != type(uint256).max) allowance[from][msg.sender] = allowed - shares;

        _burn(from, shares);

        emit Withdraw(from, to, amount);

        beforeWithdraw(amount);

        asset.safeTransfer(to, amount);
    }

    function redeem(
        uint256 shares,
        address to,
        address from
    ) public virtual override returns (uint256 amount) {
        beforeShareTransfer();

        uint256 allowed = allowance[from][msg.sender]; // Saves gas for limited approvals.

        if (msg.sender != from && allowed != type(uint256).max) allowance[from][msg.sender] = allowed - shares;

        // Check for rounding error since we round down in previewRedeem.
        require((amount = previewRedeem(shares)) != 0, 'ZERO_ASSETS');

        _burn(from, shares);

        emit Withdraw(from, to, amount);

        beforeWithdraw(amount);

        asset.safeTransfer(to, amount);
    }

    function beforeShareTransfer() internal virtual;
}
