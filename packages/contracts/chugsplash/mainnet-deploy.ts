import { ChugSplashConfig } from '@eth-optimism/chugsplash'

const config: ChugSplashConfig = {
  options: {
    name: 'Optimistic Ethereum (mainnet)',
    owner: '0x4cdC4f412355F296C2cf261210Cc9274404E442b',
  },
  contracts: {
    ChainStorageContainer_CTC_batches: {
      source: 'ChainStorageContainer',
      variables: {
        owner: '{{ contracts.CanonicalTransactionChain }}',
      },
    },
    ChainStorageContainer_SCC_batches: {
      source: 'ChainStorageContainer',
      variables: {
        owner: '{{ contracts.StateCommitmentChain }}',
      },
    },
    CanonicalTransactionChain: {
      source: 'CanonicalTransactionChain',
      variables: {
        enqueueGasCost: 60_000,
        l2GasDiscountDivisor: 32,
        enqueueL2GasPrepaid: 1_920_000,
        maxTransactionGasLimit: 15_000_000,
      },
    },
    StateCommitmentChain: {
      source: 'StateCommitmentChain',
      variables: {
        FRAUD_PROOF_WINDOW: 604_800,
        SEQUENCER_PUBLISH_WINDOW: 12_592_000,
      },
    },
    L1CrossDomainMessenger: {
      source: 'L1CrossDomainMessenger',
      variables: {
        xDomainMsgSender: '0x000000000000000000000000000000000000dEaD',
        _initialized: true,
        _owner: '0x4cdC4f412355F296C2cf261210Cc9274404E442b',
        _paused: false,
        _status: 1, // _NOT_ENTERED
      },
    },
  },
}

export default config
