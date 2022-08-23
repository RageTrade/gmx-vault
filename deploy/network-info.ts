import hre from 'hardhat';

export const skip = () => true;

export interface NetworkInfo {
  MULTISIG: string;

  KEEPER_ADDRESS: string;

  DEPOSIT_CAP_C3CLT: number;

  UNISWAP_V3_FACTORY_ADDRESS: string;
  UNISWAP_V3_DEFAULT_FEE_TIER: number;
  UNISWAP_V3_ROUTER_ADDRESS: string;

  RAGE_CLEARING_HOUSE_ADDRESS?: string;
  RAGE_CLEARING_HOUSE_LENS_ADDRESS?: string;
  RAGE_SETTLEMENT_TOKEN_ADDRESS?: string;
  RAGE_ETH_VTOKEN_ADDRESS?: string;
  RAGE_SWAP_SIMULATOR?: string;

  CURVE_QUOTER: string;
  CURVE_TOKEN_ADDRESS: string;
  CURVE_GAUGE_ADDRESS: string;
  CURVE_TRICRYPTO_POOL: string;
  CURVE_TRICRYPTO_LP_TOKEN: string;

  CURVE_USD_ORACLE: string;
  ETH_USD_ORACLE: string;
  BTC_USD_ORACLE: string;
  USDT_USD_ORACLE: string;

  WETH_ADDRESS: string;
  WBTC_ADDRESS: string;
  USDT_ADDRESS: string;

  GMX_ADDRESS: string;
  GLP_ADDRESS: string;
  SGLP_ADDRESS: string;
  GLP_MANAGER_ADDRESS: string;
  REWARD_ROUTER_ADDRESS: string;
}

export const UNISWAP_V3_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
export const UNISWAP_V3_DEFAULT_FEE_TIER = 500;
export const UNISWAP_V3_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

export const arbitrumInfo: () => NetworkInfo = () => ({
  MULTISIG: '0xee2A909e3382cdF45a0d391202Aff3fb11956Ad1', // teamMultisig address

  KEEPER_ADDRESS: '0x0C0e6d63A7933e1C2dE16E1d5E61dB1cA802BF51',

  DEPOSIT_CAP_C3CLT: 250_000 / 800, // CURVE_TRICRYPTO_LP_TOKEN

  UNISWAP_V3_FACTORY_ADDRESS,
  UNISWAP_V3_DEFAULT_FEE_TIER,
  UNISWAP_V3_ROUTER_ADDRESS,

  RAGE_CLEARING_HOUSE_ADDRESS: require('@ragetrade/core/deployments/arbmain/ClearingHouse.json').address,
  RAGE_CLEARING_HOUSE_LENS_ADDRESS: require('@ragetrade/core/deployments/arbmain/ClearingHouseLens.json').address,
  RAGE_SETTLEMENT_TOKEN_ADDRESS: require('@ragetrade/core/deployments/arbmain/SettlementToken.json').address,
  RAGE_ETH_VTOKEN_ADDRESS: require('@ragetrade/core/deployments/arbmain/ETH-vToken.json').address,
  RAGE_SWAP_SIMULATOR: require('@ragetrade/core/deployments/arbmain/SwapSimulator.json').address,

  CURVE_QUOTER: '0x2C2FC48c3404a70F2d33290d5820Edf49CBf74a5',
  CURVE_TOKEN_ADDRESS: '0x11cdb42b0eb46d95f990bedd4695a6e3fa034978',
  CURVE_GAUGE_ADDRESS: '0x97E2768e8E73511cA874545DC5Ff8067eB19B787',
  CURVE_TRICRYPTO_POOL: '0x960ea3e3C7FB317332d990873d354E18d7645590',
  CURVE_TRICRYPTO_LP_TOKEN: '0x8e0B8c8BB9db49a46697F3a5Bb8A308e744821D2',

  CURVE_USD_ORACLE: '0xaebDA2c976cfd1eE1977Eac079B4382acb849325',
  ETH_USD_ORACLE: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
  BTC_USD_ORACLE: '0x6ce185860a4963106506C203335A2910413708e9',
  USDT_USD_ORACLE: '0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7',

  WETH_ADDRESS: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  WBTC_ADDRESS: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  USDT_ADDRESS: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',

  GMX_ADDRESS: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
  GLP_ADDRESS: '0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258',
  SGLP_ADDRESS: '0x2F546AD4eDD93B956C8999Be404cdCAFde3E89AE',
  GLP_MANAGER_ADDRESS: '0x321F653eED006AD1C29D174e17d96351BDe22649',
  REWARD_ROUTER_ADDRESS: '0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1',
});

export const arbitrumTestnetInfo: () => NetworkInfo = () => ({
  MULTISIG: '0x4ec0dda0430A54b4796109913545F715B2d89F34',

  KEEPER_ADDRESS: '0xe1829BaD81E9146E18f28E28691D930c052483bA',

  DEPOSIT_CAP_C3CLT: 1_000_000_000,

  UNISWAP_V3_FACTORY_ADDRESS,
  UNISWAP_V3_DEFAULT_FEE_TIER,
  UNISWAP_V3_ROUTER_ADDRESS,

  RAGE_CLEARING_HOUSE_ADDRESS: require('@ragetrade/core/deployments/arbtest/ClearingHouse.json').address,
  RAGE_CLEARING_HOUSE_LENS_ADDRESS: require('@ragetrade/core/deployments/arbtest/ClearingHouseLens.json').address,
  RAGE_SETTLEMENT_TOKEN_ADDRESS: require('@ragetrade/core/deployments/arbtest/SettlementToken.json').address,
  RAGE_ETH_VTOKEN_ADDRESS: require('@ragetrade/core/deployments/arbtest/ETH-vToken.json').address,
  RAGE_SWAP_SIMULATOR: require('@ragetrade/core/deployments/arbtest/SwapSimulator.json').address,

  CURVE_QUOTER: '0x07E837cAbcC37A8b185051Ae0E984346CECde049',
  CURVE_TOKEN_ADDRESS: '0xc6BeC13cBf941E3f9a0D3d21B68c5518475a3bAd',
  CURVE_GAUGE_ADDRESS: '0xcFe36c05f4001E01f0f549Faa3a2d248446D03D2',
  CURVE_TRICRYPTO_POOL: '0x07E837cAbcC37A8b185051Ae0E984346CECde049',
  CURVE_TRICRYPTO_LP_TOKEN: '0x931073e47baA30389A195CABcf5F3549157afdc9',

  CURVE_USD_ORACLE: '0x95299F9956491E198181E0b2C285EB1D80E1e0F7',
  ETH_USD_ORACLE: '0x5f0423B1a6935dc5596e7A24d98532b67A0AeFd8',
  BTC_USD_ORACLE: '0x0c9973e7a27d00e656B9f153348dA46CaD70d03d',
  USDT_USD_ORACLE: '0xb1Ac85E779d05C2901812d812210F6dE144b2df0',

  WETH_ADDRESS: '0xFCfbfcC11d12bCf816415794E5dc1BBcc5304e01',
  USDT_ADDRESS: '0x237b3B5238D2022aA80cAd1f67dAE53f353F74bF',
  WBTC_ADDRESS: '0xF2bf2a5CF00c9121A18d161F6738D39Ab576DB68',

  GMX_ADDRESS: '0x35601e6181887bd6Edc6261be5C8fc9dA50679F6',
  GLP_ADDRESS: '0xb4f81Fa74e06b5f762A104e47276BA9b2929cb27',
  SGLP_ADDRESS: '0xfa14956e27D55427f7E267313D1E12d2217747e6',
  GLP_MANAGER_ADDRESS: '0xD875d99E09118d2Be80579b9d23E83469077b498',
  REWARD_ROUTER_ADDRESS: '0xE4180809231B554423b28EfB8c13819fe5b2c930',
});

// arbitrum mainnet fork
export const hardhatNetworkInfo: () => NetworkInfo = () => ({
  MULTISIG: '0x4ec0dda0430A54b4796109913545F715B2d89F34',

  KEEPER_ADDRESS: '0xe1829BaD81E9146E18f28E28691D930c052483bA',

  DEPOSIT_CAP_C3CLT: 1_000_000, // CURVE_TRICRYPTO_LP_TOKEN

  UNISWAP_V3_FACTORY_ADDRESS,
  UNISWAP_V3_DEFAULT_FEE_TIER,
  UNISWAP_V3_ROUTER_ADDRESS,

  // if addresses are undefined it deploys the contracts
  RAGE_CLEARING_HOUSE_ADDRESS: undefined,
  RAGE_CLEARING_HOUSE_LENS_ADDRESS: undefined,
  RAGE_SETTLEMENT_TOKEN_ADDRESS: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
  RAGE_ETH_VTOKEN_ADDRESS: undefined,
  RAGE_SWAP_SIMULATOR: undefined,

  CURVE_QUOTER: '0x2C2FC48c3404a70F2d33290d5820Edf49CBf74a5',
  CURVE_TOKEN_ADDRESS: '0x11cdb42b0eb46d95f990bedd4695a6e3fa034978',
  CURVE_GAUGE_ADDRESS: '0x97E2768e8E73511cA874545DC5Ff8067eB19B787',
  CURVE_TRICRYPTO_POOL: '0x960ea3e3C7FB317332d990873d354E18d7645590',
  CURVE_TRICRYPTO_LP_TOKEN: '0x8e0B8c8BB9db49a46697F3a5Bb8A308e744821D2',

  CURVE_USD_ORACLE: '0xaebDA2c976cfd1eE1977Eac079B4382acb849325',
  ETH_USD_ORACLE: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
  BTC_USD_ORACLE: '0x6ce185860a4963106506C203335A2910413708e9',
  USDT_USD_ORACLE: '0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7',

  WETH_ADDRESS: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  WBTC_ADDRESS: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  USDT_ADDRESS: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',

  GMX_ADDRESS: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
  GLP_ADDRESS: '0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258',
  SGLP_ADDRESS: '0x2F546AD4eDD93B956C8999Be404cdCAFde3E89AE',
  GLP_MANAGER_ADDRESS: '0x321F653eED006AD1C29D174e17d96351BDe22649',
  REWARD_ROUTER_ADDRESS: '0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1',
});

export function getNetworkInfo(chainId?: number): NetworkInfo {
  switch (chainId) {
    case 42161: // TODO add core contract addresses above
      return arbitrumInfo();
    case 421611:
      return arbitrumTestnetInfo();
    case 31337:
      return hardhatNetworkInfo();
    default:
      throw new Error(`Chain ID ${chainId} is recognized, please add addresses to deploy/network-info.ts`);
  }
}

export const waitConfirmations = hre.network.config.chainId !== 31337 ? 2 : 0;
