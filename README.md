# Rippled exporter for Prometheus

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

Metrics page example:

```
# HELP rippled_version Client version
# TYPE rippled_version gauge
rippled_version{value="1.0.1+DEBUG"} 1

# HELP rippled_complete_ledgers Info about complete ledgers
# TYPE rippled_complete_ledgers gauge
rippled_complete_ledgers{type="from"} 41191892
rippled_complete_ledgers{type="to"} 41192920
rippled_complete_ledgers{type="total"} 1028
rippled_complete_ledgers{type="progress"} 0.00002

# HELP rippled_fee Fee in drops (1e-6 XRP)
# TYPE rippled_fee gauge
rippled_fee{type="base"} 10

# HELP rippled_peers Peer count
# TYPE rippled_peers gauge
rippled_peers{version="all"} 10
rippled_peers{version="rippled-1.0.1"} 10
```

Usage:

```
docker run \
  -p 8000:8000 \
  -e RIPPLED_EXPORTER_LISTEN=0.0.0.0:8000 \
  -e RIPPLED_EXPORTER_NODE=http://rippled:5005/ \
  quay.io/exodusmovement/rippled-exporter
```

### LICENSE

MIT
