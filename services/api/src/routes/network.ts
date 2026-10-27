/**
 * Network topology routes – Prisma-backed.
 */
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const CreateUtilitySchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
});

const CreateNetworkSchema = z.object({
  utilityId: z.string(),
  name: z.string().min(2),
});

const CreateNodeSchema = z.object({
  externalId: z.string(),
  name: z.string(),
  type: z.enum(["meter", "junction", "source", "sink"]),
  lat: z.number(),
  lng: z.number(),
});

const CreateEdgeSchema = z.object({
  externalId: z.string(),
  name: z.string().optional(),
  fromNode: z.string(),
  toNode: z.string(),
  sectorId: z.string().optional(),
});

const CreateSectorSchema = z.object({
  externalId: z.string(),
  name: z.string(),
  inflowMeterIds: z.array(z.string()).min(1),
  outflowMeterIds: z.array(z.string()).min(1),
  absoluteLossThresholdM3: z.number().optional(),
  relativeLossThresholdPct: z.number().optional(),
});

export async function networkRoutes(app: FastifyInstance) {
  app.post("/utilities", async (request, reply) => {
    const body = CreateUtilitySchema.parse(request.body);
    const u = await prisma.utility.create({ data: body });
    return reply.status(201).send(u);
  });

  app.get("/utilities", async () => prisma.utility.findMany({ orderBy: { name: "asc" } }));

  app.post("/networks", async (request, reply) => {
    const body = CreateNetworkSchema.parse(request.body);
    const n = await prisma.network.create({ data: body });
    return reply.status(201).send(n);
  });

  app.get("/networks", async (request) => {
    const utilityId = (request.query as any)?.utilityId as string | undefined;
    return prisma.network.findMany({
      where: utilityId ? { utilityId } : undefined,
      include: { _count: { select: { nodes: true, edges: true, sectors: true } } },
      orderBy: { name: "asc" },
    });
  });

  app.get("/networks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const n = await prisma.network.findUnique({
      where: { id },
      include: { nodes: true, edges: true, sectors: true },
    });
    if (!n) return reply.status(404).send({ error: "Network not found" });
    return n;
  });

  app.get("/networks/:id/topology", async (request, reply) => {
    const { id } = request.params as { id: string };
    const n = await prisma.network.findUnique({
      where: { id },
      include: { nodes: true, edges: true, sectors: true },
    });
    if (!n) return reply.status(404).send({ error: "Network not found" });
    return {
      networkId: n.id,
      name: n.name,
      nodes: n.nodes,
      edges: n.edges,
      sectors: n.sectors.map((s) => ({
        id: s.id,
        externalId: s.externalId,
        name: s.name,
        status: s.status,
        netLossM3: s.netLossM3,
        message: s.message,
        color:
          s.status === "intact"
            ? "#22c55e"
            : s.status === "minor"
              ? "#f59e0b"
              : s.status === "high"
                ? "#ef4444"
                : "#94a3b8",
      })),
    };
  });

  app.post("/networks/:networkId/nodes", async (request, reply) => {
    const { networkId } = request.params as { networkId: string };
    const body = CreateNodeSchema.parse(request.body);
    const node = await prisma.node.create({ data: { networkId, ...body } });
    return reply.status(201).send(node);
  });

  app.post("/networks/:networkId/edges", async (request, reply) => {
    const { networkId } = request.params as { networkId: string };
    const body = CreateEdgeSchema.parse(request.body);
    const edge = await prisma.edge.create({ data: { networkId, ...body } });
    return reply.status(201).send(edge);
  });

  app.post("/networks/:networkId/sectors", async (request, reply) => {
    const { networkId } = request.params as { networkId: string };
    const body = CreateSectorSchema.parse(request.body);
    const sector = await prisma.sector.create({
      data: {
        networkId,
        externalId: body.externalId,
        name: body.name,
        inflowMeterIds: body.inflowMeterIds,
        outflowMeterIds: body.outflowMeterIds,
        absoluteLossThresholdM3: body.absoluteLossThresholdM3 ?? 5,
        relativeLossThresholdPct: body.relativeLossThresholdPct ?? 8,
      },
    });
    return reply.status(201).send(sector);
  });

  app.get("/sectors", async (request) => {
    const networkId = (request.query as any)?.networkId as string | undefined;
    return prisma.sector.findMany({
      where: networkId ? { networkId } : undefined,
      orderBy: { name: "asc" },
    });
  });

  app.get("/sectors/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const s = await prisma.sector.findUnique({ where: { id } });
    if (!s) return reply.status(404).send({ error: "Sector not found" });
    return s;
  });

  app.patch("/sectors/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string; netLossM3?: number; message?: string };
    const s = await prisma.sector.update({
      where: { id },
      data: {
        status: body.status,
        netLossM3: body.netLossM3,
        message: body.message,
        lastBalancedAt: new Date(),
      },
    });
    return s;
  });

  app.post("/networks/seed-demo", async (request, reply) => {
    let utility = await prisma.utility.findFirst({ where: { slug: "demo-utility" } });
    if (!utility) {
      utility = await prisma.utility.create({
        data: { name: "Demo Utility", slug: "demo-utility" },
      });
    }
    let network = await prisma.network.findFirst({
      where: { utilityId: utility.id, name: "Demo Network" },
    });
    if (network) {
      return { message: "Demo already exists", networkId: network.id };
    }
    network = await prisma.network.create({
      data: {
        utilityId: utility.id,
        name: "Demo Network",
        nodes: {
          create: [
            { externalId: "M1", name: "North Source Meter", type: "meter", lat: 0.35, lng: 32.58 },
            { externalId: "M2", name: "Central Junction Meter", type: "meter", lat: 0.32, lng: 32.59 },
            { externalId: "M3", name: "South Outlet Meter", type: "meter", lat: 0.29, lng: 32.6 },
            { externalId: "J1", name: "Central Junction", type: "junction", lat: 0.33, lng: 32.585 },
          ],
        },
        edges: {
          create: [
            { externalId: "E1", fromNode: "M1", toNode: "J1", sectorId: "S1", name: "North Feeder" },
            { externalId: "E2", fromNode: "J1", toNode: "M2", sectorId: "S2", name: "Central Main" },
            { externalId: "E3", fromNode: "M2", toNode: "M3", sectorId: "S3", name: "South Extension" },
          ],
        },
        sectors: {
          create: [
            {
              externalId: "S1",
              name: "North Branch",
              inflowMeterIds: ["M1"],
              outflowMeterIds: ["M2"],
              status: "intact",
              netLossM3: 0.4,
              message: "Balanced",
            },
            {
              externalId: "S2",
              name: "Central Main",
              inflowMeterIds: ["M2"],
              outflowMeterIds: ["M3"],
              status: "minor",
              netLossM3: 7.2,
              message: "Elevated loss detected",
            },
            {
              externalId: "S3",
              name: "South Extension",
              inflowMeterIds: ["M2"],
              outflowMeterIds: ["M3"],
              status: "high",
              netLossM3: 18.5,
              message: "Sustained high loss",
            },
          ],
        },
      },
    });
    return reply.status(201).send({ message: "Demo network created", networkId: network.id });
  });
}
