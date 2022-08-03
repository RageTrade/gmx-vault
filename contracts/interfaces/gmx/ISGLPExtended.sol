// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ISGLPExtended {
    function glp() external view returns (address);

    function glpManager() external view returns (address);

    function feeGlpTracker() external view returns (address);

    function stakedGlpTracker() external view returns (address);
}
