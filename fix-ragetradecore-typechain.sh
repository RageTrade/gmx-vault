#!/usr/bin/env bash
# this should be run post install

# there is some weird bug in typechain that doesn't generate artifact dir in the right place during @ragetrade/core postinstall run

mkdir -p node_modules/@ragetrade/core/typechain-types/artifacts
ls node_modules/@ragetrade/core/typechain-types/
cp -r node_modules/@ragetrade/core/typechain-types/@chainlink node_modules/@ragetrade/core/typechain-types/artifacts/
cp -r node_modules/@ragetrade/core/typechain-types/@openzeppelin node_modules/@ragetrade/core/typechain-types/artifacts/
cp -r node_modules/@ragetrade/core/typechain-types/@uniswap node_modules/@ragetrade/core/typechain-types/artifacts/
cp -r node_modules/@ragetrade/core/typechain-types/contracts node_modules/@ragetrade/core/typechain-types/artifacts/
cp -r node_modules/@ragetrade/core/typechain-types/index.ts node_modules/@ragetrade/core/typechain-types/artifacts/
cp -r node_modules/@ragetrade/core/typechain-types/common.ts node_modules/@ragetrade/core/typechain-types/artifacts/
