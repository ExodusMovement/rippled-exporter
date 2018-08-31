#!/usr/bin/env node
const fetch = require('node-fetch')
const polka = require('polka')
const yargs = require('yargs')
const winston = require('winston')
const { Registry, Gauge } = require('prom-client')

const logger = winston.createLogger({
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()]
})

function getArgs () {
  return yargs
    .usage('Usage: $0 [options]')
    .env('RIPPLED_EXPORTER')
    .option('interval', {
      default: 100,
      describe: 'Metrics fetch interval',
      type: 'number'
    })
    .option('listen', {
      coerce (arg) {
        const [hostname, port] = arg.split(':')
        return { hostname, port }
      },
      default: 'localhost:8000',
      describe: 'Provide metrics on host:port/metrics',
      type: 'string'
    })
    .option('node', {
      default: 'http://localhost:5005/',
      describe: 'Fetch info from this node'
    })
    .version()
    .help('help').alias('help', 'h')
    .argv
}

async function makeRequest (url, method, params = {}) {
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params
    }),
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  })

  const json = await res.json()
  const error = json.error || (json.result.error && { code: json.result.error_code, message: json.result.error_message })
  if (error) throw new Error(`RPC error for ${url} (code: ${error.code}): ${error.message}`)

  return json.result
}

function initParityMetrics (registry, url) {
  const createGauge = (name, help, labelNames) => new Gauge({ name, help, labelNames, registers: [registry] })

  const gauges = {
    version: createGauge('rippled_version', 'Client version', ['value']),
    ledgers: createGauge('rippled_complete_ledgers', 'Info about complete ledgers', ['type']),
    fee: createGauge('rippled_fee', 'Fee in drops (1e-6 XRP)', ['type']),
    peers: createGauge('rippled_peers', 'Peer count', ['version'])
  }

  const data = {
    version: '',
    ledgers: [0, 0],
    fee: 0,
    peers: { all: 0 }
  }

  return async () => {
    const [
      { info },
      { peers: srvpeers }
    ] = await Promise.all([
      makeRequest(url, 'server_info'),
      makeRequest(url, 'peers')
    ])

    const version = info.build_version
    if (data.version !== version) {
      gauges.version.set({ value: version }, 1)
      data.version = version
      logger.info(`update version to ${version}`)
    }

    const ledgers = info.complete_ledgers.split('-').map((x) => parseInt(x, 10))
    const progress = parseFloat(((ledgers[1] - ledgers[0]) / ledgers[1]).toFixed(5))
    if (!Number.isNaN(progress) && data.ledgers.join('-') !== ledgers.join('-')) {
      gauges.ledgers.set({ type: 'from' }, ledgers[0])
      gauges.ledgers.set({ type: 'to' }, ledgers[1])
      gauges.ledgers.set({ type: 'total' }, ledgers[1] - ledgers[0])
      gauges.ledgers.set({ type: 'progress' }, progress)
      data.ledgers = ledgers
      logger.info(`update ledgers to ${ledgers.join('-')}`)
    }

    if (info.validated_ledger) {
      const fee = Math.ceil(info.validated_ledger.base_fee_xrp * 1e6)
      if (data.fee !== fee) {
        gauges.fee.set({ type: 'base' }, fee)
        data.fee = fee
        logger.info(`update fee to ${fee}`)
      }
    }

    gauges.peers.reset()
    const rpeers = srvpeers || []
    const peers = { all: rpeers.length }
    for (const item of rpeers) peers[item.version] = (peers[item.version] || 0) + 1
    for (const [version, value] of Object.entries(peers)) {
      gauges.peers.set({ version }, value)
    }
  }
}

function createPrometheusClient (args) {
  const register = new Registry()
  return {
    update: initParityMetrics(register, args.node),
    onRequest (req, res) {
      res.setHeader('Content-Type', register.contentType)
      res.end(register.metrics())
    }
  }
}

async function main () {
  const args = getArgs()
  const client = createPrometheusClient(args)
  await polka().get('/metrics', client.onRequest).listen(args.listen.port, args.listen.hostname)
  logger.info(`listen at ${args.listen.hostname}:${args.listen.port}`)

  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))

  while (true) {
    const ts = Date.now()
    await client.update()
    const delay = Math.max(10, args.interval - (Date.now() - ts))
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

main().catch((err) => {
  logger.error(String(err.stack || err))
  process.exit(1)
})
