// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import { ERC4626 } from '@rari-capital/solmate/src/mixins/ERC4626.sol';
import { ERC20 } from '@rari-capital/solmate/src/tokens/ERC20.sol';
import { SafeTransferLib } from '@rari-capital/solmate/src/utils/SafeTransferLib.sol';
import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

import { console } from 'hardhat/console.sol';

abstract contract RageERC4626 is ERC4626 {

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol
    ) ERC4626(_asset, _name, _symbol) {}

    function deposit(uint256 amount, address to) public virtual override returns (uint256 shares) {
        console.log("entered deposit");
        _beforeShareTransfer();
        console.log("before share transfer success");
        return super.deposit(amount, to);
    }

    function mint(uint256 shares, address to) public virtual override returns (uint256 amount) {
        _beforeShareTransfer();
        return super.deposit(shares, to);
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
