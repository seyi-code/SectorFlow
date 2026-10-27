/**
 * Telemetry ingest + balance job queue – Prisma-backed.
 */
import { FastifyInstance } from "fastify";
import Redis from "ioredis";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380/0");

const ReadingSchema = z.object({
  meterId: z.string(),
  timestamp: z.string().datetime(),
  cumulativeVolumeM3: z.number(),
  flowRateLps: z.number().optional(),
});

const IngestSchema = z.object({
  networkId: z.string(),
  readings: z.array(ReadingSchema).min(1),
});

export async function telemetryRoutes(app: FastifyInstance) {
  app.post("/telemetry", async (request, reply) => {
    const body = IngestSchema.parse(request.body);
    const network = await prisma.network.findUnique({ where: { id: body.networkId } });
    if (!network) return reply.status(404).send({ error: "Network not found" });

    const created = await prisma.$transaction(
      body.readings.map((r) =>
        prisma.meterReading.create({
          data: {
            networkId: body.networkId,
            meterId: r.meterId,
            timestamp: new Date(r.timestamp),
            cumulativeVolumeM3: r.cumulativeVolumeM3,
            flowRateLps: r.flowRateLps,
          },
        })
      )
    );
    return { accepted: created.length, networkId: body.networkId };
  });

  app.get("/telemetry/:networkId/latest", async (request, reply) => {
    const { networkId } = request.params as { networkId: string };
    const readings = await prisma.meterReading.findMany({
      where: { networkId },
      orderBy: { timestamp: "desc" },
      take: 200,
    });
    const byMeter = new Map<string, (typeof readings)[0]>();
    for (const r of readings) {
      if (!byMeter.has(r.meterId)) byMeter.set(r.meterId, r);
    }
    return { networkId, readings: Array.from(byMeter.values()) };
  });

  app.post("/balance/:sectorId", async (request, reply) => {
    const { sectorId } = request.params as { sectorId: string };
    const sector = await prisma.sector.findUnique({ where: { id: sectorId } });
    if (!sector) return reply.status(404).send({ error: "Sector not found" });

    const meterIds = [...new Set([...sector.inflowMeterIds, ...sector.outflowMeterIds])];
    const recent = await prisma.meterReading.findMany({
      where: { networkId: sector.networkId, meterId: { in: meterIds } },
      orderBy: { timestamp: "desc" },
      take: meterIds.length * 4,
    });

    const byMeter: Record<string, typeof recent> = {};
    for (const r of recent) {
      if (!byMeter[r.meterId]) byMeter[r.meterId] = [];
      if (byMeter[r.meterId].length < 2) byMeter[r.meterId].push(r);
    }

    const current_readings: Record<string, object> = {};
    const previous_readings: Record<string, object> = {};
    for (const mid of meterIds) {
      const list = byMeter[mid] || [];
      if (list[0]) {
        current_readings[mid] = {
          meter_id: mid,
          timestamp: list[0].timestamp.toISOString(),
          cumulative_volume_m3: list[0].cumulativeVolumeM3,
          flow_rate_lps: list[0].flowRateLps,
        };
      }
      if (list[1]) {
        previous_readings[mid] = {
          meter_id: mid,
          timestamp: list[1].timestamp.toISOString(),
          cumulative_volume_m3: list[1].cumulativeVolumeM3,
          flow_rate_lps: list[1].flowRateLps,
        };
      }
    }

    const job = {
      sector: {
        sector_id: sector.id,
        name: sector.name,
        inflow_meter_ids: sector.inflowMeterIds,
        outflow_meter_ids: sector.outflowMeterIds,
        absolute_loss_threshold_m3: sector.absoluteLossThresholdM3,
        relative_loss_threshold_pct: sector.relativeLossThresholdPct,
        window_minutes: 30,
        baseline_window_hours: 24,
        min_samples_for_baseline: 5,
      },
      current_readings,
      previous_readings,
    };

    await redis.lpush("sectorflow:balance_jobs", JSON.stringify(job));
    return { message: "Balance job queued", sectorId: sector.id };
  });

  app.get("/balance/:sectorId", async (request, reply) => {
    const { sectorId } = request.params as { sectorId: string };
    const raw = await redis.get(`sectorflow:result:${sectorId}`);
    if (!raw) return reply.status(404).send({ error: "No result yet" });
    const result = JSON.parse(raw);

    await prisma.sector.update({
      where: { id: sectorId },
      data: {
        status:
          result.status === "intact"
            ? "intact"
            : result.status === "minor"
              ? "minor"
              : result.status === "high"
                ? "high"
                : "unknown",
        netLossM3: result.net_loss_m3,
        message: result.message,
        lastBalancedAt: new Date(),
      },
    });

    if (result.status === "high" || result.status === "minor") {
      const sector = await prisma.sector.findUnique({ where: { id: sectorId } });
      if (sector) {
        await prisma.alertEvent.create({
          data: {
            networkId: sector.networkId,
            sectorId,
            status: result.status,
            message: result.message,
          },
        });
      }
    }

    return result;
  });
}
