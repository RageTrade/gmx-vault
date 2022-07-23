// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

/* solhint-disable */
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import { ERC20PresetMinterPauser } from '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol';

contract GmxVaultMock is ERC20PresetMinterPauser{

    constructor() ERC20PresetMinterPauser('GMXShares', 'GMXShares') {}
    function deposit(uint256 amount, address receiver) external returns(uint256) {
        IERC20(0x2F546AD4eDD93B956C8999Be404cdCAFde3E89AE).transferFrom(msg.sender, address(this), amount);
        _mint(receiver,amount);
        return amount;
    }
}
