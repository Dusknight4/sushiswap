import { Token } from '@sushiswap/currency'
import { PoolCode } from '@sushiswap/router'
import { FeeAmount } from '@sushiswap/v3-sdk'
import IUniswapV3Factory from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'
import IUniswapV3Pool from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json'
import { Abi, AbiEvent } from 'abitype'
import { Address, Log, PublicClient } from 'viem'
import { Filter } from 'viem/dist/types/types/filter'

import { MultiCallAggregator } from './MulticallAggregator'
import { UniV3EventsAbi, UniV3PoolWatcher } from './UniV3PoolWatcher'

export interface PoolInfo {
  address: Address
  token0: Token
  token1: Token
  fee: FeeAmount
}

enum LogsProcessing {
  NotStarted,
  Starting,
  Started,
}

// TODO: PoolCode update cache with timer
// TODO: Known pools permanent cache
// TODO: pools reserves update 1/1000 logs
export class UniV3Extractor {
  factoryAddress: Address
  providerName: string
  tickHelperContract: Address
  client: PublicClient
  multiCallAggregator: MultiCallAggregator
  poolMap: Map<Address, UniV3PoolWatcher> = new Map()
  otherFactoryPoolSet: Set<Address> = new Set()
  eventFilters: Filter[] = []
  logProcessGuard = false
  lastProcessdBlock = -1n
  logProcessingStatus = LogsProcessing.NotStarted

  constructor(client: PublicClient, factoryAddress: Address, providerName: string, tickHelperContract: Address) {
    this.factoryAddress = factoryAddress
    this.providerName = providerName
    this.client = client
    this.multiCallAggregator = new MultiCallAggregator(client)
    this.tickHelperContract = tickHelperContract
  }

  // TODO: stop ?
  async start() {
    if (this.logProcessingStatus == LogsProcessing.NotStarted) {
      this.logProcessingStatus = LogsProcessing.Starting
      // Subscribe to each UniV3 event we are interested
      for (let i = 0; i < UniV3EventsAbi.length; ++i) {
        const filter = (await this.client.createEventFilter({ event: UniV3EventsAbi[i] as AbiEvent })) as Filter
        this.eventFilters.push(filter)
      }

      this.client.watchBlockNumber({
        onBlockNumber: async (blockNumber) => {
          if (!this.logProcessGuard) {
            this.logProcessGuard = true
            const promises = this.eventFilters.map((f) => this.client.getFilterChanges({ filter: f }))
            const logss = await Promise.all(promises)
            logss.forEach((logs) => {
              logs.forEach((l) => this.processLog(l))
            })
            this.lastProcessdBlock = blockNumber
            this.logProcessGuard = false
          } else {
            console.warn(`Extractor: Log Filtering was skipped for block ${blockNumber}`)
          }
        },
      })
      this.logProcessingStatus = LogsProcessing.Started
    }
  }

  processLog(l: Log) {
    const pool = this.poolMap.get(l.address.toLowerCase() as Address)
    if (pool) pool.processLog(l)
    else this.addPoolByAddress(l.address)
  }

  async addPoolsForTokens(tokens: Token[]) {
    const promises: Promise<Address>[] = []
    for (let i = 0, promiseIndex = 0; i < tokens.length; ++i) {
      for (let j = i + 1; j < tokens.length; ++j) {
        const [a0, a1] = tokens[i].sortsBefore(tokens[j])
          ? [tokens[i].address, tokens[j].address]
          : [tokens[j].address, tokens[i].address]
        Object.values(FeeAmount).forEach((fee) => {
          promises[promiseIndex++] = this.multiCallAggregator.callValue(
            this.factoryAddress,
            IUniswapV3Factory.abi as Abi,
            'getPool',
            [a0, a1, fee]
          )
        })
      }
    }

    const result = await Promise.all(promises)

    const pools: PoolInfo[] = []
    for (let i = 0, promiseIndex = 0; i < tokens.length; ++i) {
      for (let j = i + 1; j < tokens.length; ++j) {
        const [token0, token1] = tokens[i].sortsBefore(tokens[j]) ? [tokens[i], tokens[j]] : [tokens[j], tokens[i]]
        Object.values(FeeAmount).forEach((fee) => {
          const address = result[promiseIndex++]
          if (address)
            pools.push({
              address,
              token0,
              token1,
              fee: fee as FeeAmount,
            })
        })
      }
    }

    pools.forEach((p) => this.addPoolWatching(p))
  }

  addPoolWatching(p: PoolInfo) {
    if (this.logProcessingStatus !== LogsProcessing.Started) {
      throw new Error('Pools can be added after Log processing have been started')
    }
    if (!this.poolMap.has(p.address.toLowerCase() as Address)) {
      const watcher = new UniV3PoolWatcher(
        this.providerName,
        p.address,
        this.tickHelperContract,
        p.token0,
        p.token1,
        p.fee,
        this.multiCallAggregator
      )
      watcher.updatePoolState()
      this.poolMap.set(p.address.toLowerCase() as Address, watcher) // lowercase because incoming events have lowcase addresses ((
    }
  }

  async addPoolByAddress(address: Address) {
    if (this.otherFactoryPoolSet.has(address)) return
    if (this.client.chain?.id === undefined) return

    const factory = await this.multiCallAggregator.call(address, IUniswapV3Pool.abi as Abi, 'factory')
    if ((factory.returnValue as Address).toLowerCase() == this.factoryAddress.toLowerCase()) {
      const token0Promise = this.multiCallAggregator.callValue(address, IUniswapV3Pool.abi as Abi, 'token0')
      const token1Promise = this.multiCallAggregator.callValue(address, IUniswapV3Pool.abi as Abi, 'token1')
      const feePromise = this.multiCallAggregator.callValue(address, IUniswapV3Pool.abi as Abi, 'fee')
      const [token0Address, token1Address, fee] = await Promise.all([token0Promise, token1Promise, feePromise])
      const token0 = new Token({
        address: token0Address as string,
        chainId: this.client.chain?.id,
        // fake data - we don't need it for uniswap pools actually
        symbol: 'Unknown',
        name: 'Unknown',
        decimals: 18,
      })
      const token1 = new Token({
        address: token1Address as string,
        chainId: this.client.chain?.id,
        // fake data - we don't need it for uniswap pools actually
        symbol: 'Unknown',
        name: 'Unknown',
        decimals: 18,
      })
      this.addPoolWatching({ address, token0, token1, fee: fee as FeeAmount })
    } else {
      this.otherFactoryPoolSet.add(address)
    }
  }

  getPoolCodes(): PoolCode[] {
    return Array.from(this.poolMap.values())
      .map((p) => p.getPoolCode())
      .filter((pc) => pc !== undefined) as PoolCode[]
  }

  // only for testing
  getStablePoolCodes(): PoolCode[] {
    return Array.from(this.poolMap.values())
      .map((p) => (p.isStable() ? p.getPoolCode() : undefined))
      .filter((pc) => pc !== undefined) as PoolCode[]
  }
}
