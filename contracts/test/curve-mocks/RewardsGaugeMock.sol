// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol';

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/* solhint-disable */

contract RewardsGaugeMock {
    address public crvToken;
    address public lpToken;

    uint256 public ratePerBlock = 10**10;

    mapping(address => uint256) internal deposited;
    mapping(address => uint256) internal accruedRewards;

    mapping(address => uint256) internal lastCheckpoint;

    constructor(address _crvToken, address _lpToken) {
        crvToken = _crvToken;
        lpToken = _lpToken;
    }

    function deposit(uint256 _value) external {
        uint256 oldCheckpoint = lastCheckpoint[msg.sender];
        lastCheckpoint[msg.sender] = block.number;

        if (oldCheckpoint != 0 && oldCheckpoint != block.number) {
            accruedRewards[msg.sender] += (block.number - oldCheckpoint) * ratePerBlock * deposited[msg.sender];
            IMintable(crvToken).mint(msg.sender, accruedRewards[msg.sender]);
            accruedRewards[msg.sender] = 0;
        }

        deposited[msg.sender] += _value;
        IERC20(lpToken).transferFrom(msg.sender, address(this), _value);
    }

    function balanceOf(address arg0) external view returns (uint256) {
        return deposited[arg0];
    }

    function withdraw(uint256 _value) external {
        uint256 oldCheckpoint = lastCheckpoint[msg.sender];
        lastCheckpoint[msg.sender] = block.number;

        if (oldCheckpoint != 0 && oldCheckpoint != block.number) {
            accruedRewards[msg.sender] += (block.number - oldCheckpoint) * ratePerBlock * deposited[msg.sender];
            IMintable(crvToken).mint(msg.sender, accruedRewards[msg.sender]);
            accruedRewards[msg.sender] = 0;
        }

        deposited[msg.sender] -= _value;
        IERC20(lpToken).transfer(msg.sender, _value);
    }

    function claim_rewards(address addr) external {
        uint256 oldCheckpoint = lastCheckpoint[msg.sender];
        lastCheckpoint[msg.sender] = block.number;

        if (oldCheckpoint != 0 && oldCheckpoint != block.number) {
            accruedRewards[msg.sender] += (block.number - oldCheckpoint) * ratePerBlock * deposited[msg.sender];
            IMintable(crvToken).mint(addr, accruedRewards[msg.sender]);
            accruedRewards[msg.sender] = 0;
        }
    }

    function claimable_reward(
        address user,
        address /** token */
    ) external view returns (uint256) {
        return accruedRewards[user];
    }

    function claimable_reward_write(
        address user,
        address /** token */
    ) external returns (uint256) {
        uint256 oldCheckpoint = lastCheckpoint[user];
        lastCheckpoint[user] = block.number;

        if (oldCheckpoint != 0 && oldCheckpoint != block.number) {
            accruedRewards[user] += (block.number - oldCheckpoint) * ratePerBlock * deposited[user];
        }

        return accruedRewards[user];
    }
}
