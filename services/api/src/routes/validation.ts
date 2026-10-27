import { FastifyInstance } from "fastify";
import { validateNetworkTopology } from "../services/topologyValidation.js";

export async function validationRoutes(app: FastifyInstance) {
  app.get("/networks/:id/validate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await validateNetworkTopology(id);
    if (!result.ok && result.issues.some((i) => i.code === "NETWORK_NOT_FOUND")) {
      return reply.status(404).send(result);
    }
    return result;
  });
}
