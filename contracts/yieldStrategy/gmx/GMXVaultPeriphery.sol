// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC4626 } from 'contracts/interfaces/IERC4626.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import { IGlpManager } from 'contracts/interfaces/gmx/IGlpManager.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';

contract GMXVaultPeriphery {
    IERC20 public immutable sGLP;
    IERC4626 public immutable gmxVault;

    IGlpManager public immutable glpManager;
    IRewardRouterV2 public immutable rewardRouter;

    constructor(
        address _gmxVault,
        address _glpManager,
        address _rewardRouter
    ) {
        gmxVault = IERC4626(_gmxVault);
        sGLP = IERC20(gmxVault.asset());

        glpManager = IGlpManager(_glpManager);
        rewardRouter = IRewardRouterV2(_rewardRouter);
    }

    function withdrawTokenAsReedem(
        IERC20 token,
        uint256 shares,
        uint256 minTokenOut,
        address receiver
    ) external {
        gmxVault.transferFrom(msg.sender, address(this), shares);
        uint256 sGLPReceived = gmxVault.redeem(shares, address(this), msg.sender);

        sGLP.approve(address(glpManager), sGLPReceived);

        rewardRouter.unstakeAndRedeemGlp(address(token), sGLPReceived, minTokenOut, receiver);
    }

    function withdrawTokenAsWithdraw(
        IERC20 token,
        uint256 _sGLP,
        uint256 minTokenOut,
        address receiver
    ) external {
        uint256 shares = gmxVault.previewWithdraw(_sGLP);

        gmxVault.transferFrom(msg.sender, address(this), shares);
        gmxVault.withdraw(_sGLP, address(this), msg.sender);

        sGLP.approve(address(glpManager), _sGLP);

        rewardRouter.unstakeAndRedeemGlp(address(token), _sGLP, minTokenOut, receiver);
    }
}
