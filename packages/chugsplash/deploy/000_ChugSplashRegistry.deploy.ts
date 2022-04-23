import { HardhatRuntimeEnvironment } from 'hardhat/types'

const deployFn = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = hre.deployments
  const { deployer } = await hre.getNamedAccounts()

  await deploy('ChugSplashRegistry', {
    from: deployer,
    args: [],
    log: true,
  })
}

export default deployFn
