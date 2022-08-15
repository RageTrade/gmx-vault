import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { GlpStakingManager, GlpStakingManager__factory } from '../../typechain-types';
import { getNetworkInfo, waitConfirmations } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy, save, execute, read },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const proxyAdminDeployment = await get('ProxyAdmin');
  const glpStakingManagerLogicDeployment = await get('GlpStakingManagerLogic');

  const networkInfo = getNetworkInfo(hre.network.config.chainId ?? 31337);

  const initializeArg: GlpStakingManager.GlpStakingManagerInitParamsStruct = {
    rageErc4626InitParams: {
      asset: networkInfo.SGLP_ADDRESS,
      name: 'GlpStakingManager',
      symbol: 'GSM',
    },
    weth: networkInfo.WETH_ADDRESS,
    usdc: networkInfo.RAGE_SETTLEMENT_TOKEN_ADDRESS ?? (await get('SettlementToken')).address,
    rewardRouter: networkInfo.REWARD_ROUTER_ADDRESS,
    feeRecipient: networkInfo.MULTISIG,
  };

  const proxyDeployment = await deploy('GlpStakingManager', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer,
    log: true,
    args: [
      glpStakingManagerLogicDeployment.address,
      proxyAdminDeployment.address,
      GlpStakingManager__factory.createInterface().encodeFunctionData('initialize', [initializeArg]),
    ],
    estimateGasExtra: 1_000_000,
    waitConfirmations,
  });
  await save('GlpStakingManager', { ...proxyDeployment, abi: glpStakingManagerLogicDeployment.abi });
};

export default func;

func.tags = ['GlpStakingManager'];
func.dependencies = ['ProxyAdmin', 'GlpStakingManagerLogic', 'SettlementToken'];
