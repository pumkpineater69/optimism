import path from 'path'
import fs from 'fs'

import { subtask, task } from 'hardhat/config'
import { SolcBuild } from 'hardhat/types'
import {
  TASK_COMPILE,
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
  TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
} from 'hardhat/builtin-tasks/task-names'
import pinataSDK from '@pinata/sdk'
import fetch from 'node-fetch'
import { add0x } from '@eth-optimism/core-utils'

import {
  parseChugSplashConfig,
  validateChugSplashConfig,
  makeActionBundleFromConfig,
  ChugSplashConfig,
  ChugSplashConfigWithInputs,
} from './config'
import { ChugSplashActionBundle } from './actions'
import { getContractArtifact } from './artifacts'
import { getStorageLayout } from './storage'

const TASK_CHUGSPLASH_LOAD = 'chugsplash:load'
const TASK_CHUGSPLASH_BUNDLE = 'chugsplash:bundle'
const TASK_CHUGSPLASH_DEPLOY = 'chugsplash:deploy'
const TASK_CHUGSPLASH_VERIFY = 'chugsplash:verify'
const TASK_CHUGSPLASH_COMMIT = 'chugsplash:commit'

subtask(TASK_CHUGSPLASH_LOAD)
  .setDescription('Loads a ChugSplash config file')
  .addParam('deployConfig', 'path to chugsplash deploy config')
  .setAction(
    async (args: { deployConfig: string }, hre): Promise<ChugSplashConfig> => {
      // Make sure we have the latest compiled code.
      await hre.run(TASK_COMPILE)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const config = require(path.resolve(args.deployConfig))
      config.default || config
      validateChugSplashConfig(config)
      return config
    }
  )

subtask(TASK_CHUGSPLASH_BUNDLE)
  .setDescription('Bundles a ChugSplash config file')
  .addParam('deployConfig', 'path to chugsplash deploy config')
  .setAction(
    async (
      args: { deployConfig: string },
      hre
    ): Promise<ChugSplashActionBundle> => {
      const config: ChugSplashConfig = await hre.run(TASK_CHUGSPLASH_LOAD, {
        deployConfig: args.deployConfig,
      })

      const artifacts = {}
      for (const contract of Object.values(config.contracts)) {
        const artifact = await getContractArtifact(contract.source)
        const storageLayout = await getStorageLayout(artifact)
        artifacts[contract.source] = {
          bytecode: artifact.bytecode,
          storageLayout,
        }
      }

      return makeActionBundleFromConfig(config, artifacts, process.env)
    }
  )

task(TASK_CHUGSPLASH_COMMIT)
  .setDescription('Commits a ChugSplash config file with artifacts to IPFS')
  .addParam('deployConfig', 'path to chugsplash deploy config')
  .addParam('pinataApiKey', 'pinata API key')
  .addParam('pinataSecretKey', 'pinata secret key')
  .setAction(
    async (
      args: {
        deployConfig: string
        pinataApiKey: string
        pinataSecretKey: string
      },
      hre
    ) => {
      const config: ChugSplashConfig = await hre.run(TASK_CHUGSPLASH_LOAD, {
        deployConfig: args.deployConfig,
      })

      // Initialize Pinata
      const pinata = pinataSDK(args.pinataApiKey, args.pinataSecretKey)

      // Test Pinata connection
      const auth = await pinata.testAuthentication()
      if (!auth.authenticated) {
        throw new Error(`pinata authentication failed: ${auth}`)
      }

      // We'll need this later
      const buildInfoFolder = path.join(
        hre.config.paths.artifacts,
        'build-info'
      )

      // Extract compiler inputs
      const inputs = fs
        .readdirSync(buildInfoFolder)
        .filter((file) => {
          return file.endsWith('.json')
        })
        .map((file) => {
          return JSON.parse(
            fs.readFileSync(path.join(buildInfoFolder, file), 'utf8')
          )
        })
        .map((content) => {
          return {
            solcVersion: content.solcVersion,
            solcLongVersion: content.solcLongVersion,
            input: content.input,
          }
        })

      // Publish config to IPFS
      const configPublishResult = await pinata.pinJSONToIPFS({
        ...config,
        inputs,
      })

      console.log(configPublishResult['IpfsHash'])
    }
  )

task(TASK_CHUGSPLASH_DEPLOY)
  .setDescription('Deploys a system based on the given deployment file')
  .addParam('deployConfig', 'path to chugsplash deploy config')
  .setAction(async (args: { deployConfig: string }, hre) => {
    const config = await hre.run(TASK_CHUGSPLASH_LOAD, {
      deployConfig: args.deployConfig,
    })
    const bundle = await hre.run(TASK_CHUGSPLASH_BUNDLE, {
      deployConfig: args.deployConfig,
    })
    console.log(
      JSON.stringify(parseChugSplashConfig(config, process.env), null, 2)
    )
    console.log(bundle)
  })

task(TASK_CHUGSPLASH_VERIFY)
  .setDescription('Checks if a deployment config matches a bundle hash')
  .addParam('configUri', 'location of the config file')
  .addParam('bundleHash', 'hash of the bundle')
  .setAction(
    async (
      args: {
        configUri: string
        bundleHash: string
      },
      hre
    ) => {
      let config: ChugSplashConfigWithInputs
      if (args.configUri.startsWith('ipfs://')) {
        config = await (
          await fetch(
            `https://cloudflare-ipfs.com/ipfs/${args.configUri.replace(
              'ipfs://',
              ''
            )}`
          )
        ).json()
      } else {
        throw new Error('unsupported URI type')
      }

      const artifacts = {}
      for (const input of config.inputs) {
        const solcBuild: SolcBuild = await hre.run(
          TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
          {
            quiet: true,
            solcVersion: input.solcVersion,
          }
        )

        let output: any // TODO: Compiler output
        if (solcBuild.isSolcJs) {
          output = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLCJS, {
            input: input.input,
            solcJsPath: solcBuild.compilerPath,
          })
        } else {
          output = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLC, {
            input: input.input,
            solcPath: solcBuild.compilerPath,
          })
        }

        for (const fileOutput of Object.values(output.contracts)) {
          for (const [contractName, contractOutput] of Object.entries(
            fileOutput
          )) {
            artifacts[contractName] = {
              bytecode: add0x(contractOutput.evm.deployedBytecode.object),
              storageLayout: contractOutput.storageLayout,
            }
          }
        }
      }

      const bundle = await makeActionBundleFromConfig(
        config,
        artifacts,
        process.env
      )

      const ok = bundle.root === args.bundleHash
      console.log(`${ok ? 'OK' : 'FAIL'}`)
    }
  )
