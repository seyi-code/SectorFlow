"""Unit tests for volumetric mass-balance."""

from datetime import datetime, timezone, timedelta
from balance import (
    SectorConfig,
    SectorState,
    MeterReading,
    SectorStatus,
    compute_sector_balance,
)


def _reading(meter_id: str, volume: float, minutes_ago: int = 0) -> MeterReading:
    return MeterReading(
        meter_id=meter_id,
        timestamp=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
        cumulative_volume_m3=volume,
    )


def test_balanced_sector():
    cfg = SectorConfig(
        sector_id="S1",
        name="Test",
        inflow_meter_ids=["IN"],
        outflow_meter_ids=["OUT"],
        absolute_loss_threshold_m3=5.0,
        relative_loss_threshold_pct=10.0,
        min_samples_for_baseline=3,
    )
    state = SectorState(config=cfg)
    prev = {"IN": _reading("IN", 100.0, 30), "OUT": _reading("OUT", 90.0, 30)}
    curr = {"IN": _reading("IN", 110.0), "OUT": _reading("OUT", 99.5)}
    result = compute_sector_balance(state, curr, prev)
    assert result.net_loss_m3 == 0.5
    assert result.status == SectorStatus.INTACT


def test_high_loss_raises_status():
    cfg = SectorConfig(
        sector_id="S2",
        name="Leaky",
        inflow_meter_ids=["IN"],
        outflow_meter_ids=["OUT"],
        absolute_loss_threshold_m3=5.0,
        relative_loss_threshold_pct=8.0,
        min_samples_for_baseline=2,
    )
    state = SectorState(config=cfg)
    prev = {"IN": _reading("IN", 0.0, 30), "OUT": _reading("OUT", 0.0, 30)}
    for i in range(3):
        curr = {
            "IN": _reading("IN", 100.0 + i * 20),
            "OUT": _reading("OUT", 50.0 + i * 5),
        }
        result = compute_sector_balance(state, curr, prev)
        prev = curr
    assert result.status in (SectorStatus.MINOR_ANOMALY, SectorStatus.HIGH_PROBABILITY)
    assert result.net_loss_m3 > 5.0


def test_insufficient_data():
    cfg = SectorConfig(
        sector_id="S3",
        name="Quiet",
        inflow_meter_ids=["IN"],
        outflow_meter_ids=["OUT"],
    )
    state = SectorState(config=cfg)
    result = compute_sector_balance(state, {}, {})
    assert result.status == SectorStatus.UNKNOWN
