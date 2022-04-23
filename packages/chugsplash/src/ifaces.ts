/* eslint-disable @typescript-eslint/no-var-requires */
import { ethers } from 'ethers'

export const ChugSplashProxyArtifact = require('../artifacts/contracts/ChugSplashProxy.sol/ChugSplashProxy.json')
export const IChugSplashDeployerArtifact = require('../artifacts/contracts/IChugSplashDeployer.sol/IChugSplashDeployer.json')
export const ChugSplashProxyABI = ChugSplashProxyArtifact.abi
export const IChugSplashDeployerABI = IChugSplashDeployerArtifact.abi
export const ChugSplashProxy = new ethers.utils.Interface(ChugSplashProxyABI)
export const ChugSplashDeployer = new ethers.utils.Interface(
  IChugSplashDeployerABI
)
