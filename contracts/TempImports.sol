// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.9;

import { ClearingHouse } from '@ragetrade/contracts/contracts/protocol/clearinghouse/ClearingHouse.sol';
import { RageTradeFactory } from '@ragetrade/contracts/contracts/protocol/RageTradeFactory.sol';
import { VPoolWrapper } from '@ragetrade/contracts/contracts/protocol/wrapper/VPoolWrapper.sol';
import { InsuranceFund } from '@ragetrade/contracts/contracts/protocol/insurancefund/InsuranceFund.sol';

import { OracleMock } from '@ragetrade/contracts/contracts/test/mocks/OracleMock.sol';
import { RealTokenMock } from '@ragetrade/contracts/contracts/test/mocks/RealTokenMock.sol';

import { IUniswapV2Router02 } from '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import { IUniswapV2Pair } from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

contract TempImports {}
