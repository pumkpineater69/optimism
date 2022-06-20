import {
  str,
  bool,
  num,
  email,
  host,
  port,
  url,
  json,
  makeValidator,
} from 'envalid'
import { Provider } from '@ethersproject/abstract-provider'
import { Signer } from '@ethersproject/abstract-signer'
import { ethers } from 'ethers'

const provider = makeValidator<Provider>((input) => {
  const parsed = url()._parse(input)
  return new ethers.providers.JsonRpcProvider(parsed)
})

const jsonRpcProvider = makeValidator<ethers.providers.JsonRpcProvider>(
  (input) => {
    const parsed = url()._parse(input)
    return new ethers.providers.JsonRpcProvider(parsed)
  }
)

const staticJsonRpcProvider =
  makeValidator<ethers.providers.StaticJsonRpcProvider>((input) => {
    const parsed = url()._parse(input)
    return new ethers.providers.StaticJsonRpcProvider(parsed)
  })

const batchJsonRpcProvider =
  makeValidator<ethers.providers.JsonRpcBatchProvider>((input) => {
    const parsed = url()._parse(input)
    return new ethers.providers.JsonRpcBatchProvider(parsed)
  })

const wallet = makeValidator<Signer>((input) => {
  if (!ethers.utils.isHexString(input)) {
    throw new Error(`expected wallet to be a hex string`)
  } else {
    return new ethers.Wallet(input)
  }
})

export const validators = {
  str,
  bool,
  num,
  email,
  host,
  port,
  url,
  json,
  wallet,
  provider,
  jsonRpcProvider,
  staticJsonRpcProvider,
  batchJsonRpcProvider,
}
