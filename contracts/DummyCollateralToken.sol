// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ERC20 } from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';

contract DummyCollateralToken is ERC20, Ownable {
    mapping(address => bool) public isMinter;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address receiver, uint256 amount) public {
        require(isMinter[msg.sender], 'Only minters can mint');
        _mint(receiver, amount);
    }

    function addMinter(address minter) public onlyOwner {
        isMinter[minter] = true;
    }

    function removeMinter(address minter) public onlyOwner {
        isMinter[minter] = false;
    }
}
