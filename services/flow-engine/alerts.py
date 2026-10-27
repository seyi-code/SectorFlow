"""
Alert fatigue controls for SectorFlow.

- Cooldown: do not re-notify same sector/severity within COOLDOWN_MINUTES.
- Hysteresis: require N consecutive anomalous windows before escalating.
- Heartbeat: meters silent longer than HEARTBEAT_TIMEOUT are offline; sectors go UNKNOWN.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Set

from balance import SectorStatus


@dataclass
class AlertState:
    last_notified_at: Optional[datetime] = None
    last_severity: Optional[SectorStatus] = None
    consecutive_count: int = 0


@dataclass
class MeterHeartbeat:
    last_seen: datetime
    offline: bool = False


class AlertManager:
    def __init__(
        self,
        cooldown_minutes: int = 60,
        escalate_after: int = 3,
        heartbeat_timeout_minutes: int = 15,
    ):
        self.cooldown = timedelta(minutes=cooldown_minutes)
        self.escalate_after = escalate_after
        self.heartbeat_timeout = timedelta(minutes=heartbeat_timeout_minutes)
        self._alerts: Dict[str, AlertState] = {}
        self._heartbeats: Dict[str, MeterHeartbeat] = {}

    def record_meter_seen(self, meter_id: str, at: Optional[datetime] = None):
        now = at or datetime.now(timezone.utc)
        self._heartbeats[meter_id] = MeterHeartbeat(last_seen=now, offline=False)

    def check_heartbeats(self, meter_ids: Set[str]) -> Set[str]:
        now = datetime.now(timezone.utc)
        offline = set()
        for mid in meter_ids:
            hb = self._heartbeats.get(mid)
            if not hb or (now - hb.last_seen) > self.heartbeat_timeout:
                offline.add(mid)
                if hb:
                    hb.offline = True
        return offline

    def should_notify(self, sector_id: str, status: SectorStatus) -> bool:
        if status in (SectorStatus.INTACT, SectorStatus.UNKNOWN):
            if sector_id in self._alerts:
                self._alerts[sector_id].consecutive_count = 0
            return False

        state = self._alerts.setdefault(sector_id, AlertState())
        now = datetime.now(timezone.utc)

        if state.last_severity == status:
            state.consecutive_count += 1
        else:
            state.consecutive_count = 1
            state.last_severity = status

        if state.consecutive_count < self.escalate_after and status != SectorStatus.HIGH_PROBABILITY:
            return False

        if state.last_notified_at and (now - state.last_notified_at) < self.cooldown:
            return False

        state.last_notified_at = now
        return True
