"""
Core volumetric mass-balance engine for SectorFlow.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Deque, Dict, List, Optional

import numpy as np
from pydantic import BaseModel, Field


class SectorStatus(str, Enum):
    INTACT = "intact"
    MINOR_ANOMALY = "minor"
    HIGH_PROBABILITY = "high"
    UNKNOWN = "unknown"


class MeterReading(BaseModel):
    meter_id: str
    timestamp: datetime
    cumulative_volume_m3: float = Field(..., description="Total volume since last reset or epoch")
    flow_rate_lps: Optional[float] = None


class SectorConfig(BaseModel):
    sector_id: str
    name: str
    inflow_meter_ids: List[str]
    outflow_meter_ids: List[str]
    absolute_loss_threshold_m3: float = 5.0
    relative_loss_threshold_pct: float = 8.0
    window_minutes: int = 30
    baseline_window_hours: int = 24
    min_samples_for_baseline: int = 10


class BalanceResult(BaseModel):
    sector_id: str
    timestamp: datetime
    volume_in_m3: float
    volume_out_m3: float
    net_loss_m3: float
    loss_pct: float
    baseline_loss_m3: Optional[float] = None
    deviation_m3: Optional[float] = None
    status: SectorStatus
    message: str


@dataclass
class SectorState:
    config: SectorConfig
    loss_history: Deque[float] = field(default_factory=lambda: deque(maxlen=500))
    last_result: Optional[BalanceResult] = None
    consecutive_anomaly_count: int = 0


def compute_sector_balance(
    state: SectorState,
    readings: Dict[str, MeterReading],
    previous_readings: Dict[str, MeterReading],
) -> BalanceResult:
    cfg = state.config
    now = datetime.now(timezone.utc)

    def delta(meter_id: str) -> float:
        curr = readings.get(meter_id)
        prev = previous_readings.get(meter_id)
        if not curr or not prev:
            return 0.0
        return max(0.0, curr.cumulative_volume_m3 - prev.cumulative_volume_m3)

    volume_in = sum(delta(mid) for mid in cfg.inflow_meter_ids)
    volume_out = sum(delta(mid) for mid in cfg.outflow_meter_ids)
    net_loss = volume_in - volume_out
    loss_pct = (net_loss / volume_in * 100.0) if volume_in > 1e-6 else 0.0

    state.loss_history.append(net_loss)
    baseline = None
    deviation = None
    if len(state.loss_history) >= cfg.min_samples_for_baseline:
        baseline = float(np.median(list(state.loss_history)))
        deviation = net_loss - baseline

    status = SectorStatus.INTACT
    message = "Within expected range"

    abs_exceeded = abs(net_loss) >= cfg.absolute_loss_threshold_m3
    rel_exceeded = abs(loss_pct) >= cfg.relative_loss_threshold_pct

    if abs_exceeded or rel_exceeded:
        state.consecutive_anomaly_count += 1
        if state.consecutive_anomaly_count >= 3:
            status = SectorStatus.HIGH_PROBABILITY
            message = f"Sustained high loss: {net_loss:.2f} m3 ({loss_pct:.1f}% of inflow)"
        else:
            status = SectorStatus.MINOR_ANOMALY
            message = f"Elevated loss detected: {net_loss:.2f} m3"
    else:
        state.consecutive_anomaly_count = 0
        message = "Balanced"

    if volume_in < 0.01 and volume_out < 0.01:
        status = SectorStatus.UNKNOWN
        message = "Insufficient flow data in window"

    result = BalanceResult(
        sector_id=cfg.sector_id,
        timestamp=now,
        volume_in_m3=round(volume_in, 4),
        volume_out_m3=round(volume_out, 4),
        net_loss_m3=round(net_loss, 4),
        loss_pct=round(loss_pct, 2),
        baseline_loss_m3=round(baseline, 4) if baseline is not None else None,
        deviation_m3=round(deviation, 4) if deviation is not None else None,
        status=status,
        message=message,
    )
    state.last_result = result
    return result


def color_for_status(status: SectorStatus) -> str:
    return {
        SectorStatus.INTACT: "#22c55e",
        SectorStatus.MINOR_ANOMALY: "#f59e0b",
        SectorStatus.HIGH_PROBABILITY: "#ef4444",
        SectorStatus.UNKNOWN: "#94a3b8",
    }.get(status, "#94a3b8")
