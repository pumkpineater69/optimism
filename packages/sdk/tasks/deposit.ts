import { task, types } from 'hardhat/config'
import '@nomiclabs/hardhat-ethers'
import 'hardhat-deploy'
import {
  predeploys,
  getContractInterface,
} from '@eth-optimism/contracts-bedrock'
import { Event } from 'ethers'

import {
  CrossChainMessenger,
  StandardBridgeAdapter,
  MessageStatus,
} from '../src'

task('deposit', 'Deposits funds onto L2.')
  .addParam(
    'l1ProviderUrl',
    'L1 provider URL.',
    'http://localhost:8545',
    types.string
  )
  .addParam(
    'l2ProviderUrl',
    'L2 provider URL.',
    'http://localhost:9545',
    types.string
  )
  /*
  .addParam('to', 'Recipient address.', null, types.string)
  .addParam('amountEth', 'Amount in ETH to send.', null, types.string)
  */
  .setAction(async (args, hre) => {
    const signers = await hre.ethers.getSigners()
    if (signers.length === 0) {
      throw new Error('No configured signers')
    }
    // Use the first configured signer for simplicity
    const signer = signers[0]
    const address = await signer.getAddress()
    console.log(`Using signer ${address}`)

    {
      const balance = await signer.getBalance()
      if (balance.eq(0)) {
        throw new Error('Signer has no balance')
      }
    }

    const l2Provider = new hre.ethers.providers.JsonRpcProvider(
      args.l2ProviderUrl
    )
    const l2Signer = new hre.ethers.Wallet(
      hre.network.config.accounts[0],
      l2Provider
    )

    const Artifact__WETH9 = await hre.deployments.getArtifact('WETH9')
    const Factory__WETH9 = new hre.ethers.ContractFactory(
      Artifact__WETH9.abi,
      Artifact__WETH9.bytecode,
      signer
    )

    console.log('Deploying WETH9')
    const WETH9 = await Factory__WETH9.deploy()
    await WETH9.deployTransaction.wait()
    console.log(`Deployed to ${WETH9.address}`)

    const Deployment__OptimismMintableERC20TokenFactory =
      await hre.deployments.get('OptimismMintableERC20Factory')
    console.log(
      `OptimismMintableERC20Factory address ${Deployment__OptimismMintableERC20TokenFactory.address}`
    )

    const Deployment__L1StandardBridgeProxy = await hre.deployments.get(
      'L1StandardBridgeProxy'
    )

    const Deployment__L1CrossDomainMessengerProxy = await hre.deployments.get(
      'L1CrossDomainMessengerProxy'
    )

    const OptimismMintableERC20TokenFactory = await hre.ethers.getContractAt(
      Deployment__OptimismMintableERC20TokenFactory.abi,
      predeploys.OptimismMintableERC20Factory,
      l2Signer
    )

    let l2WethAddress: string
    {
      console.log('Creating L2 WETH9')
      const deployTx =
        await OptimismMintableERC20TokenFactory.createOptimismMintableERC20(
          WETH9.address,
          'L2 Wrapped Ether',
          'L2-WETH9'
        )
      const receipt = await deployTx.wait()
      const event = receipt.events.find(
        (e: Event) => e.event === 'OptimismMintableERC20Created'
      )
      if (!event) {
        throw new Error('Unable to find OptimismMintableERC20Created event')
      }
      // TODO: update this when bugfix is merged
      l2WethAddress = event.args.remoteToken
    }
    console.log(`L2 WETH9 deployed to ${l2WethAddress}`)

    {
      console.log('Wrapping ETH')
      const deposit = await signer.sendTransaction({
        value: hre.ethers.utils.parseEther('1'),
        to: WETH9.address,
      })
      await deposit.wait()

      const balance = await WETH9.balanceOf(address)
      console.log(`${address} has ${balance.toString()}`)
    }

    const messenger = new CrossChainMessenger({
      l1SignerOrProvider: signer,
      l2SignerOrProvider: l2Signer,
      l1ChainId: await signer.getChainId(),
      l2ChainId: await l2Signer.getChainId(),
      bridges: {
        Standard: {
          Adapter: StandardBridgeAdapter,
          l1Bridge: Deployment__L1StandardBridgeProxy.address,
          l2Bridge: predeploys.L2StandardBridge,
        },
      },
      contracts: {
        l1: {
          L1StandardBridge: Deployment__L1StandardBridgeProxy.address,
          L1CrossDomainMessenger:
            Deployment__L1CrossDomainMessengerProxy.address,
        },
      },
      bedrock: true,
    })

    {
      console.log(`Approving WETH9`)
      const approvalTx = await messenger.approveERC20(
        WETH9.address,
        l2WethAddress,
        hre.ethers.constants.MaxUint256
      )
      await approvalTx.wait()
      console.log('WETH9 approved')
    }

    {
      console.log('Depositing ERC20')
      const depositTx = await messenger.depositERC20(
        WETH9.address,
        l2WethAddress,
        hre.ethers.utils.parseEther('1')
      )
      await depositTx.wait()
      console.log('ERC20 deposited')

      const receipt = await messenger.waitForMessageReceipt(tx)
      if (receipt.receiptStatus !== 1) {
        throw new Error('deposit failed')
      }

      const L2WETH9 = new hre.ethers.Contract(
        l2WethAddress,
        getContractInterface('OptimismMintableERC20'),
        l2Signer
      )

      const l2Balance = await L2WETH9.balanceOf(await signer.getAddress())
      if (l2Balance.lt(hre.ethers.utils.parseEther('1'))) {
        throw new Error('bad deposit')
      }
      console.log('Deposit success')
    }

    console.log('Starting withdrawal')

    const tx = await messenger.withdrawERC20(
      WETH9.address,
      l2WethAddress,
      hre.ethers.utils.parseEther('1')
    )
    await tx.wait()

    console.log('Waiting for message to be able to be relayed')
    await messenger.waitForMessageStatus(tx, MessageStatus.READY_FOR_RELAY)

    // TODO: how to wait until the state root has been posted?
    const finalize = await messenger.finalizeMessage(tx)
    console.log(finalize)
  })
