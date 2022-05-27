// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

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
        uint256 updatedAmount = beforeWithdrawClosePosition(amount);
        shares = super.withdraw(updatedAmount, to, from);
    }

    function maxShares() public returns (uint256) {
        return convertToShares(maxAssets());
    }

    function maxAssets() public returns (uint256 _maxAssets) {
        try this.maxAssetsAlwaysReverts() {
            // should not happen as this should always revert
            revert();
        } catch (bytes memory data) {
            (_maxAssets) = abi.decode(data, (uint256));
        }
    }

    function maxAssetsAlwaysReverts() public {
        require(msg.sender == address(this));
        _beforeShareAllocation();
        uint256 _maxAssets = beforeWithdrawClosePosition(totalAssets());
        assembly {
            // storing maxAssets in memory first slot scratch space
            mstore(0, _maxAssets)
            // revert these steps and return maxAssets as error data
            revert(0, 0x20)
        }
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
        require((amount = previewRedeem(shares)) != 0, 'ZERO_ASSETS');

        //Additional cap on withdraw to ensure the position closed does not breach slippage tolerance
        //In case tolerance is reached only partial withdraw is executed
        uint256 updatedAmount = beforeWithdrawClosePosition(amount);
        if (updatedAmount != amount) {
            amount = updatedAmount;
            shares = previewWithdraw(updatedAmount);
        }

        beforeWithdraw(amount, shares);

        _burn(from, shares);

        emit Withdraw(msg.sender, to, from, amount, shares);

        asset.safeTransfer(to, amount);
    }

    function _beforeShareAllocation() internal virtual;

    function beforeWithdrawClosePosition(uint256 amount) internal virtual returns (uint256 updatedAmount);
}
