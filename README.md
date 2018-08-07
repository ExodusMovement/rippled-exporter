# Rippled exporter for Prometheus
[![Docker Stars](https://img.shields.io/docker/stars/exodusmovement/rippled-exporter.svg?style=flat-square)](https://hub.docker.com/r/exodusmovement/rippled-exporter/)
[![Docker Pulls](https://img.shields.io/docker/pulls/exodusmovement/rippled-exporter.svg?style=flat-square)](https://hub.docker.com/r/exodusmovement/rippled-exporter/)

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

Metrics page example:

```
# HELP rippled_version Client version
# TYPE rippled_version gauge
rippled_version{name="xrp1",value="1.0.1+DEBUG"} 1

# HELP rippled_peers Peer count
# TYPE rippled_peers gauge
rippled_peers{name="xrp1",topic="total"} 10
rippled_peers{name="xrp1",topic="rippled-1.0.1"} 9
rippled_peers{name="xrp1",topic="rippled-1.0.0"} 1

# HELP rippled_fee Base fee in drops (1e-6 XRP)
# TYPE rippled_fee gauge
rippled_fee{name="xrp1"} 10

# HELP rippled_complete_ledgers Info about complete ledgers
# TYPE rippled_complete_ledgers gauge
rippled_complete_ledgers{name="xrp1",topic="from"} 40636982
rippled_complete_ledgers{name="xrp1",topic="to"} 40638281
rippled_complete_ledgers{name="xrp1",topic="total"} 1299
rippled_complete_ledgers{name="xrp1",topic="progress"} 0.003196
```

Config example:

```
port: 8000
hostname: 127.0.0.1

interval: 100 # in ms
nodes:
  - name: xr1
    url: http://localhost:5005/
```

Usage:

```
docker run -p 8000:8000 exodusmovement/rippled-exporter
```

### LICENSE

MIT
