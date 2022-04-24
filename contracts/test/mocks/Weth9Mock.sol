// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { TokenMock } from './TokenMock.sol';

contract Weth9Mock is TokenMock {
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    constructor(uint256 initialSupply_) TokenMock('Wrapped Ether', 'WETH', 18, initialSupply_) {}

    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 wad) public {
        _burn(msg.sender, wad);
        payable(msg.sender).transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }
}
