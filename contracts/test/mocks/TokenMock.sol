// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

/* solhint-disable */

import { ERC20PresetMinterPauser } from '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol';

contract TokenMock is ERC20PresetMinterPauser {
    uint8 immutable decimals__;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply_
    ) ERC20PresetMinterPauser(name_, symbol_) {
        decimals__ = decimals_;
        if (initialSupply_ > 0) _mint(msg.sender, initialSupply_);
    }

    function decimals() public view virtual override returns (uint8) {
        return decimals__;
    }
}
