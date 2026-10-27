import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import dotenv from "dotenv";
import { networkRoutes } from "./routes/network.js";
import { telemetryRoutes } from "./routes/telemetry.js";

dotenv.config();

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(",") ?? true,
});

await app.register(rateLimit, {
  max: 200,
  timeWindow: "1 minute",
});

app.get("/health", async () => ({
  status: "ok",
  service: "sectorflow-api",
  timestamp: new Date().toISOString(),
}));

await app.register(networkRoutes, { prefix: "/api/v1" });
await app.register(telemetryRoutes, { prefix: "/api/v1" });

const port = Number(process.env.PORT ?? 4001);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  console.log(`SectorFlow API listening on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
