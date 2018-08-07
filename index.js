const fs = require('fs').promises
const path = require('path')
const fetch = require('node-fetch')
const yaml = require('js-yaml')
const polka = require('polka')
const yargs = require('yargs')
const winston = require('winston')
const { Registry, Gauge, metrics: promMetrics } = require('prom-client2')

const logger = winston.createLogger({
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()]
})

function getArgs () {
  return yargs
    .usage('Usage: $0 [options]')
    .option('config', {
      coerce: (arg) => path.resolve(arg),
      default: path.join(__dirname, 'config.yaml'),
      type: 'string'
    })
    .version()
    .help('help').alias('help', 'h')
    .argv
}

async function readConfig (config) {
  const content = await fs.readFile(config, 'utf8')
  return yaml.safeLoad(content)
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

function initParityMetrics (registry, nodes) {
  const gauges = {
    version: new Gauge({
      name: 'rippled_version',
      help: 'Client version',
      labelNames: ['name', 'value'],
      registers: [registry]
    }),
    peers: new Gauge({
      name: 'rippled_peers',
      help: 'Peer count',
      labelNames: ['name', 'topic'],
      registers: [registry]
    }),
    fee: new Gauge({
      name: 'rippled_fee',
      help: 'Base fee in drops (1e-6 XRP)',
      labelNames: ['name'],
      registers: [registry]
    }),
    ledgers: new Gauge({
      name: 'rippled_complete_ledgers',
      help: 'Info about complete ledgers',
      labelNames: ['name', 'topic'],
      registers: [registry]
    })
  }

  const dataNodes = {}
  for (const node of nodes) {
    dataNodes[node.name] = {
      version: '',
      peers: { all: 0 },
      fee: 0,
      ledgers: [0, 0]
    }
  }

  const update = async ({ name, url }) => {
    const [
      resServerInfo,
      resPeers
    ] = await Promise.all([
      makeRequest(url, 'server_info'),
      makeRequest(url, 'peers')
    ])

    const data = dataNodes[name]

    const version = resServerInfo.info.build_version
    if (data.version !== version) {
      gauges.version.labels({ name, value: version }).set(1)
      data.version = version
      logger.info(`Update ${name}:version to ${version}`)
    }

    const rpeers = resPeers.peers || []
    const peers = { all: rpeers.length }
    for (const item of rpeers) peers[item.version] = (peers[item.version] || 0) + 1
    const isPeersChanged = Object.keys(peers).some((key) => data.peers[key] !== peers[key])
    if (isPeersChanged) {
      for (const [topic, value] of Object.entries(peers)) {
        gauges.peers.labels({ name, topic }).set(value)
      }

      data.peers = peers
      logger.info(`Update ${name}:peers to ${peers.all}`)
    }

    if (resServerInfo.info.validated_ledger) {
      const fee = Math.ceil(resServerInfo.info.validated_ledger.base_fee_xrp * 1e6)
      if (data.fee !== fee) {
        gauges.fee.labels({ name }).set(fee)
        data.fee = fee
        logger.info(`Update ${name}:fee to ${fee}`)
      }
    }

    const ledgers = resServerInfo.info.complete_ledgers.split('-').map((x) => parseInt(x, 10))
    const progress = parseFloat(((ledgers[1] - ledgers[0]) * 100 / ledgers[1]).toFixed(6))
    if (!Number.isNaN(progress) && data.ledgers.join('-') !== ledgers.join('-')) {
      gauges.ledgers.labels({ name, topic: 'from' }).set(ledgers[0])
      gauges.ledgers.labels({ name, topic: 'to' }).set(ledgers[1])
      gauges.ledgers.labels({ name, topic: 'total' }).set(ledgers[1] - ledgers[0])
      gauges.ledgers.labels({ name, topic: 'progress' }).set(progress)
      data.ledgers = ledgers
      logger.info(`Update ${name}:ledgers to ${ledgers.join('-')}`)
    }
  }

  return async () => {
    await Promise.all(nodes.map((node) => update(node)))
  }
}

function createPrometheusClient (config) {
  const register = new Registry()
  if (config.processMetrics) promMetrics.setup(register, 1000)

  return {
    update: initParityMetrics(register, config.nodes),
    onRequest (req, res) {
      res.setHeader('Content-Type', register.contentType)
      res.end(register.exposeText())
    }
  }
}

async function main () {
  const args = getArgs()
  const config = await readConfig(args.config)

  const client = createPrometheusClient(config)
  await polka().get('/metrics', client.onRequest).listen(config.port, config.hostname)
  logger.info(`listen at ${config.hostname}:${config.port}`)

  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))

  while (true) {
    const ts = Date.now()
    await client.update()
    const delay = Math.max(10, config.interval - (Date.now() - ts))
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

main().catch((err) => {
  logger.error(String(err.stack || err))
  process.exit(1)
})
