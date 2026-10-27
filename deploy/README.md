# Deployment – SectorFlow

## Local

```bash
docker compose -f infra/docker-compose.yml up -d
```

## Production checklist

- Persist topology + readings in Postgres
- Meter heartbeat timeouts
- Alert cooldown + hysteresis (`alerts.py`)
- Field validation before acting on HIGH alerts
- Topology completeness audit
- Sensor calibration process
- Metrics: loss volume, alert rate, offline meters
- Backups

## Fly / Render

Web + API + Python worker, managed Postgres + Redis. Add MQTT bridge if needed.
