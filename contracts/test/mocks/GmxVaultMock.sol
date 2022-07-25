// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

/* solhint-disable */
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import { ERC20PresetMinterPauser } from '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol';
import { IGMXBatchingManager } from 'contracts/interfaces/gmx/IGMXBatchingManager.sol';

contract GmxVaultMock is ERC20PresetMinterPauser {
    IGMXBatchingManager batchingManager;
    IERC20 sGlp;

    constructor(IGMXBatchingManager _batchingManager, IERC20 _sGlp) ERC20PresetMinterPauser('GMXShares', 'GMXShares') {
        batchingManager = _batchingManager;
        sGlp = _sGlp;
    }

    function grantAllowances() external {
        IERC20(0x82aF49447D8a07e3bd95BD0d56f35241523fBab1).approve(address(batchingManager), type(uint256).max);
        IERC20(0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8).approve(address(batchingManager), type(uint256).max);
    }

    function deposit(uint256 amount, address receiver) external returns (uint256) {
        sGlp.transferFrom(msg.sender, address(this), amount);
        _mint(receiver, amount);
        return amount;
    }

    function depositToken(address token, uint256 amount) external returns (uint256) {
        batchingManager.depositToken(token, amount, address(this));
    }
}
