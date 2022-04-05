import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import addresses from '../fixtures/addresses';
import { curveYieldStrategyFixture } from '../fixtures/curve-yield-strategy';

const main = async () => {
  const [admin, user] = await hre.ethers.getSigners();
  const PATH =
    '0x11cdb42b0eb46d95f990bedd4695a6e3fa034978000bb882af49447d8a07e3bd95bd0d56f35241523fbab10001f4fd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
  const ONE = BigNumber.from(10).pow(18);
  const { crv, weth, gauge, usdt, lpToken, triCrypto, crvOracle, lpOracle, uniswapQuoter, curveYieldStrategyTest } =
    await curveYieldStrategyFixture();
  const curveYieldStrategy = curveYieldStrategyTest.connect(admin);

  await Promise.all([
    hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [addresses.LP_TOKEN_WHALE],
    }),
    hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [addresses.USDT_WHALE],
    }),
    hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [addresses.WETH_WHALE],
    }),
    hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [addresses.WBTC_WHALE],
    }),
    hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [addresses.CRV_WHALE],
    }),
  ]);

  const [triCryptoWhale, usdtWhale, wbtcWhale, wethWhale, crvWhale] = await Promise.all([
    ethers.getSigner(addresses.LP_TOKEN_WHALE),
    ethers.getSigner(addresses.USDT_WHALE),
    ethers.getSigner(addresses.WBTC_WHALE),
    ethers.getSigner(addresses.WETH_WHALE),
    ethers.getSigner(addresses.CRV_WHALE),
  ]);

  const getReserves = async () => {
    return Promise.all([lpOracle.lp_price(), triCrypto.balances(0), triCrypto.balances(1), triCrypto.balances(2)]);
  };

  const [initialLpTokenPrice, initialUsdtReserve, initialWbtcReserve, initialWethReserve] = await getReserves();

  console.log('LP TOKEN PRICE', initialLpTokenPrice, '$');
  console.log('USDT RESERVE', initialUsdtReserve, ' USDT');
  console.log('WBTC RESERVE', initialWbtcReserve, ' WBTC');
  console.log('WETH RESERVE', initialWethReserve, ' WETH');

  let etherToswap = 10;

  await weth.connect(wethWhale).transfer(admin.address, ONE.mul(etherToswap));
  await weth.connect(admin).approve(triCrypto.address, ONE.mul(etherToswap));

  let dy = await triCrypto.get_dy(2, 0, ONE.mul(etherToswap));

  console.log('SWAPPING 10 ETH');
  await triCrypto['exchange(uint256,uint256,uint256,uint256,bool)'](2, 0, ONE.mul(etherToswap), dy, false);

  let [finalLpTokenPrice, finalUsdtReserve, finalWbtcReserve, finalWethReserve] = await getReserves();

  console.log('LP TOKEN', finalLpTokenPrice, '$');
  console.log('USDT RESERVE', finalUsdtReserve, ' USDT');
  console.log('WBTC RESERVE', finalWbtcReserve, ' WBTC');
  console.log('WETH RESERVE', finalWethReserve, ' WETH');

  // =============================================
  const amount = BigNumber.from(10).pow(18).mul(50);
  console.log('AMOUNT OF LP DEPOSITED : ', amount.toBigInt());

  await curveYieldStrategy.connect(admin).updateDepositCap(amount);

  await lpToken.connect(triCryptoWhale).transfer(user.address, amount);
  await lpToken.connect(user).approve(curveYieldStrategy.address, amount);

  await curveYieldStrategy.connect(user).deposit(amount, user.address);
  console.log('AMOUT OF SHARES RECEIVED : ', (await curveYieldStrategy.balanceOf(user.address)).toBigInt());

  await hre.network.provider.send('evm_increaseTime', [10_000_000]);
  await hre.network.provider.send('evm_mine', []);

  await gauge.claimable_reward_write(curveYieldStrategy.address, addresses.CRV);
  console.log(
    'CLAIMABLE CRV REWARDS : ',
    (await gauge.claimable_reward(curveYieldStrategy.address, addresses.CRV)).toBigInt(),
  );
  await curveYieldStrategy.harvestFees();
  console.log('LP TOKENS IN VAULT AFTER HARVESTING : ', (await curveYieldStrategy.totalAssets()).toBigInt());
  console.log('PRICE PER SHARE AFTER HARVESTING : ', (await curveYieldStrategy.previewMint(10n ** 18n)).toBigInt());
  console.log('CRV TOKENS IN VAULT (FEES) : ', (await crv.balanceOf(curveYieldStrategy.address)).toBigInt());

  [finalLpTokenPrice, finalUsdtReserve, finalWbtcReserve, finalWethReserve] = await getReserves();

  console.log('LP TOKEN', finalLpTokenPrice, '$');
  console.log('USDT RESERVE', finalUsdtReserve, ' USDT');
  console.log('WBTC RESERVE', finalWbtcReserve, ' WBTC');
  console.log('WETH RESERVE', finalWethReserve, ' WETH');
  // =============================================
  etherToswap = 15;

  await weth.connect(wethWhale).transfer(admin.address, ONE.mul(etherToswap));
  await weth.connect(admin).approve(triCrypto.address, ONE.mul(etherToswap));

  dy = await triCrypto.get_dy(2, 0, ONE.mul(etherToswap));

  console.log('SWAPPING 15 ETH');
  await triCrypto['exchange(uint256,uint256,uint256,uint256,bool)'](2, 0, ONE.mul(etherToswap), dy, false);

  [finalLpTokenPrice, finalUsdtReserve, finalWbtcReserve, finalWethReserve] = await getReserves();

  console.log('LP TOKEN', finalLpTokenPrice, '$');
  console.log('USDT RESERVE', finalUsdtReserve, ' USDT');
  console.log('WBTC RESERVE', finalWbtcReserve, ' WBTC');
  console.log('WETH RESERVE', finalWethReserve, ' WETH');

  console.log('LP TOKENS IN VAULT AFTER HARVESTING : ', (await curveYieldStrategy.totalAssets()).toBigInt());
  console.log('PRICE PER SHARE AFTER HARVESTING : ', (await curveYieldStrategy.previewMint(10n ** 18n)).toBigInt());
  console.log('CRV TOKENS IN VAULT (FEES) : ', (await crv.balanceOf(curveYieldStrategy.address)).toBigInt());
  // =============================================

  etherToswap = 30;

  await weth.connect(wethWhale).transfer(admin.address, ONE.mul(etherToswap));
  await weth.connect(admin).approve(triCrypto.address, ONE.mul(etherToswap));

  dy = await triCrypto.get_dy(2, 0, ONE.mul(etherToswap));

  console.log('SWAPPING 30 ETH');
  await triCrypto['exchange(uint256,uint256,uint256,uint256,bool)'](2, 0, ONE.mul(etherToswap), dy, false);

  [finalLpTokenPrice, finalUsdtReserve, finalWbtcReserve, finalWethReserve] = await getReserves();

  console.log('LP TOKEN', finalLpTokenPrice, '$');
  console.log('USDT RESERVE', finalUsdtReserve, ' USDT');
  console.log('WBTC RESERVE', finalWbtcReserve, ' WBTC');
  console.log('WETH RESERVE', finalWethReserve, ' WETH');

  console.log('LP TOKENS IN VAULT AFTER HARVESTING : ', (await curveYieldStrategy.totalAssets()).toBigInt());
  console.log('PRICE PER SHARE AFTER HARVESTING : ', (await curveYieldStrategy.previewMint(10n ** 18n)).toBigInt());
  console.log('CRV TOKENS IN VAULT (FEES) : ', (await crv.balanceOf(curveYieldStrategy.address)).toBigInt());
  // =============================================

  let usdtToSwap = 10_000;
  const POW_SIX = BigNumber.from(6).pow(10);

  console.log(await usdt.balanceOf(admin.address))
  await usdt.connect(usdtWhale).transfer(admin.address, POW_SIX.mul(usdtToSwap));
  console.log('here')
  await usdt.connect(admin).approve(triCrypto.address, POW_SIX.mul(usdtToSwap));
  console.log('approve passed')

  dy = await triCrypto.get_dy(0, 2, ONE.mul(usdtToSwap));
  console.log('cross dy');

  console.log('SWAPPING 10,000 USDT');
  await triCrypto['exchange(uint256,uint256,uint256,uint256,bool)'](0, 2, ONE.mul(usdtToSwap), dy, false);

  [finalLpTokenPrice, finalUsdtReserve, finalWbtcReserve, finalWethReserve] = await getReserves();

  console.log('LP TOKEN', finalLpTokenPrice, '$');
  console.log('USDT RESERVE', finalUsdtReserve, ' USDT');
  console.log('WBTC RESERVE', finalWbtcReserve, ' WBTC');
  console.log('WETH RESERVE', finalWethReserve, ' WETH');

  console.log('LP TOKENS IN VAULT AFTER HARVESTING : ', (await curveYieldStrategy.totalAssets()).toBigInt());
  console.log('PRICE PER SHARE AFTER HARVESTING : ', (await curveYieldStrategy.previewMint(10n ** 18n)).toBigInt());
  console.log('CRV TOKENS IN VAULT (FEES) : ', (await crv.balanceOf(curveYieldStrategy.address)).toBigInt());
  // =============================================

  usdtToSwap = 10_000;

  await usdt.connect(usdtWhale).transfer(admin.address, POW_SIX.mul(usdtToSwap));
  await usdt.connect(admin).approve(triCrypto.address, POW_SIX.mul(usdtToSwap));

  dy = await triCrypto.get_dy(0, 2, ONE.mul(usdtToSwap));

  console.log('SWAPPING 10,000 USDT');
  await triCrypto['exchange(uint256,uint256,uint256,uint256,bool)'](0, 2, ONE.mul(usdtToSwap), dy, false);

  [finalLpTokenPrice, finalUsdtReserve, finalWbtcReserve, finalWethReserve] = await getReserves();

  console.log('LP TOKEN', finalLpTokenPrice, '$');
  console.log('USDT RESERVE', finalUsdtReserve, ' USDT');
  console.log('WBTC RESERVE', finalWbtcReserve, ' WBTC');
  console.log('WETH RESERVE', finalWethReserve, ' WETH');
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
