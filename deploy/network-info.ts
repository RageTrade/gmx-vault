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

  ETH_USD_ORACLE: string;

  WETH_ADDRESS?: string;
  WBTC_ADDRESS?: string;
  USDT_ADDRESS?: string;

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

  ETH_USD_ORACLE: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',

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

  ETH_USD_ORACLE: '0x5f0423B1a6935dc5596e7A24d98532b67A0AeFd8',

  WETH_ADDRESS: '0xFCfbfcC11d12bCf816415794E5dc1BBcc5304e01',
  USDT_ADDRESS: '0x237b3B5238D2022aA80cAd1f67dAE53f353F74bF',
  WBTC_ADDRESS: '0xF2bf2a5CF00c9121A18d161F6738D39Ab576DB68',

  GMX_ADDRESS: '0x0A72Ee78CcC55b979A4a77943745b202A11A931B',
  GLP_ADDRESS: '0xc78Cb6Ee5515109064E4DBca1c38759b6da4615f',
  SGLP_ADDRESS: '0xe2f057A1F5A1F100b9bF991709432f89602eAC68',
  GLP_MANAGER_ADDRESS: '0x9f3be2329E1698eEfFE1c9358a3AB2e7fdBeF527',
  REWARD_ROUTER_ADDRESS: '0xd007269EbdA744566225FBa7fCCee758d7dCE0FC',
});

export const arbitrumGoerliInfo: () => NetworkInfo = () => ({
  MULTISIG: '0x4ec0dda0430A54b4796109913545F715B2d89F34',

  KEEPER_ADDRESS: '0xe1829BaD81E9146E18f28E28691D930c052483bA',

  DEPOSIT_CAP_C3CLT: 1_000_000_000,

  UNISWAP_V3_FACTORY_ADDRESS: '0x4584E64B9cae7c86810a8a0A3c4469c4d164459f',
  UNISWAP_V3_DEFAULT_FEE_TIER,
  UNISWAP_V3_ROUTER_ADDRESS: '0xc05237c7c22bd0550fdab72858bc9fb517e3324e',

  RAGE_CLEARING_HOUSE_ADDRESS: require('@ragetrade/core/deployments/arbgoerli/ClearingHouse.json').address,
  RAGE_CLEARING_HOUSE_LENS_ADDRESS: require('@ragetrade/core/deployments/arbgoerli/ClearingHouseLens.json').address,
  RAGE_SETTLEMENT_TOKEN_ADDRESS: require('@ragetrade/core/deployments/arbgoerli/SettlementToken.json').address,
  RAGE_ETH_VTOKEN_ADDRESS: require('@ragetrade/core/deployments/arbgoerli/ETH-vToken.json').address,
  RAGE_SWAP_SIMULATOR: require('@ragetrade/core/deployments/arbgoerli/SwapSimulator.json').address,

  ETH_USD_ORACLE: '0xef54dB43b6b7a28A26041577716b1aD5F78f699E',

  WETH_ADDRESS: '0x007354C7DD2EB9f636204192092d7221c9d988F2',
  USDT_ADDRESS: '0x37E607e9f601D718A50221f62b3f4816D0e6352e',
  WBTC_ADDRESS: '0x577231039631e714d89a99828C9038D390dfe909',

  GMX_ADDRESS: 'address',
  GLP_ADDRESS: 'address',
  SGLP_ADDRESS: 'address',
  GLP_MANAGER_ADDRESS: 'address',
  REWARD_ROUTER_ADDRESS: 'address',
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
    case 421613:
      return arbitrumGoerliInfo();
    case 31337:
      return hardhatNetworkInfo();
    default:
      throw new Error(`Chain ID ${chainId} is recognized, please add addresses to deploy/network-info.ts`);
  }
}

export const waitConfirmations = hre.network.config.chainId !== 31337 ? 2 : 0;
