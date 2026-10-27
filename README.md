# SectorFlow

**Distributed Smart-Water Leak Detection & Volumetric Balancing**

SectorFlow helps small utilities and rural networks find leaks by balancing water volume pumped vs received across sectors. Simple flow meters + mass-balance math + live map status.

Repo: https://github.com/seyi-code/SectorFlow

## Production-ready foundation includes

- Pure NumPy mass-balance engine (`services/flow-engine/balance.py`)
- Unit tests for balanced / high-loss / insufficient-data cases
- Alert fatigue controls: cooldown, consecutive-window hysteresis, meter heartbeat offline detection (`alerts.py`)
- Next.js UI with sector list + SVG network map (color: green / orange / red)
- Fastify API scaffold for topology + telemetry ingest
- Docker Compose (Postgres 5433, Redis 6380)
- Deploy notes

## What you still must do for a real pilot

1. Persist topology + readings in Postgres (replace in-memory maps).
2. Validate meters and complete topology on a real network.
3. Wire notifications (email / SMS / webhook) behind `AlertManager.should_notify`.
4. Field validation SOP before acting on HIGH alerts.
5. Observability (metrics for loss volume, offline meters, alert rate).
6. MQTT bridge if meters publish to MQTT.

## Core formula

Net Loss = Σ Volume_In − Σ Volume_Out

Rolling baseline + absolute/relative thresholds + consecutive anomaly count drive status.

## Quick start

```bash
docker compose -f infra/docker-compose.yml up -d
cd services/flow-engine && pip install -r requirements.txt && python -m pytest tests/
cd ../api && npm i && npm run dev
cd ../../apps/web && npm i && npm run dev
```

## License

MIT recommended.
