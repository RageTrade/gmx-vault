// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ISGLPExtended {
    function stakedGlpTracker() external view returns (address);

    function feeGlpTracker() external view returns (address);
}
