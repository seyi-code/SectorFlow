/**
 * Topology quality checks before trusting mass-balance results.
 */
import { prisma } from "../db/prisma.js";

export type TopologyIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export async function validateNetworkTopology(networkId: string): Promise<{
  ok: boolean;
  issues: TopologyIssue[];
}> {
  const network = await prisma.network.findUnique({
    where: { id: networkId },
    include: { nodes: true, edges: true, sectors: true },
  });
  if (!network) {
    return {
      ok: false,
      issues: [{ severity: "error", code: "NETWORK_NOT_FOUND", message: "Network not found" }],
    };
  }

  const issues: TopologyIssue[] = [];
  const nodeIds = new Set(network.nodes.map((n) => n.externalId));
  const meterIds = new Set(
    network.nodes.filter((n) => n.type === "meter").map((n) => n.externalId)
  );

  if (network.nodes.length === 0) {
    issues.push({ severity: "error", code: "NO_NODES", message: "Network has no nodes" });
  }
  if (network.sectors.length === 0) {
    issues.push({ severity: "warning", code: "NO_SECTORS", message: "Network has no sectors" });
  }

  for (const e of network.edges) {
    if (!nodeIds.has(e.fromNode)) {
      issues.push({
        severity: "error",
        code: "EDGE_BAD_FROM",
        message: `Edge ${e.externalId} fromNode ${e.fromNode} not in nodes`,
      });
    }
    if (!nodeIds.has(e.toNode)) {
      issues.push({
        severity: "error",
        code: "EDGE_BAD_TO",
        message: `Edge ${e.externalId} toNode ${e.toNode} not in nodes`,
      });
    }
  }

  for (const s of network.sectors) {
    for (const mid of [...s.inflowMeterIds, ...s.outflowMeterIds]) {
      if (!meterIds.has(mid)) {
        issues.push({
          severity: "error",
          code: "SECTOR_UNKNOWN_METER",
          message: `Sector ${s.externalId} references meter ${mid} which is not a meter node`,
        });
      }
    }
    if (s.inflowMeterIds.length === 0 || s.outflowMeterIds.length === 0) {
      issues.push({
        severity: "error",
        code: "SECTOR_EMPTY_FLOW",
        message: `Sector ${s.externalId} needs at least one inflow and one outflow meter`,
      });
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues };
}
