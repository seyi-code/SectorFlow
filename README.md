# SectorFlow

**Distributed Smart-Water Leak Detection & Volumetric Balancing**

https://github.com/seyi-code/SectorFlow

## Production foundation

- Prisma schema: Utility → Network → Node / Edge / Sector / MeterReading / AlertEvent
- Fastify API (Prisma-backed): utilities, networks, topology, telemetry ingest, balance jobs
- NumPy mass-balance engine + unit tests
- Alert fatigue: cooldown, hysteresis, meter heartbeat
- Demo seed: `POST /api/v1/networks/seed-demo`

## Quick start

```bash
docker compose -f infra/docker-compose.yml up -d
cd services/api && npm i && npx prisma generate && npx prisma migrate dev
npm run dev   # port 4001

cd ../flow-engine && pip install -r requirements.txt && pytest && python worker.py
cd ../../apps/web && npm i && npm run dev   # port 3001
```

### API flow

1. `POST /api/v1/networks/seed-demo` → get `networkId`
2. `GET /api/v1/networks/:id/topology` → map data
3. `POST /api/v1/telemetry` with readings
4. `POST /api/v1/balance/:sectorId` → queue job
5. `GET /api/v1/balance/:sectorId` → result + persisted sector status

## Still required for production pilot

- Field validation of meters and topology
- Notification channels behind AlertManager
- OpenTelemetry + backups
- MQTT bridge if meters publish MQTT

## License

MIT recommended.
