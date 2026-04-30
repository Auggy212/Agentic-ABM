"""
Contact picker — pure function, no I/O.

pick_committee(candidates, target_size=5) -> list[BuyerProfile]

Applies the quota distribution rule:
  1 DECISION_MAKER  (highest seniority / confidence)
  up to 2 CHAMPIONs
  1 BLOCKER
  1 INFLUENCER

Hard cap: 5 contacts per account. Never pads with duplicates or empty slots.

Tier priority (Tier 1 before Tier 2 before Tier 3) is enforced by BuyerIntelAgent
when it orders the account list before calling this function, not here.
This function only cares about role distribution within a single account.
"""

from __future__ import annotations

from backend.schemas.models import BuyerProfile, CommitteeRole

_ROLE_SLOTS: dict[CommitteeRole, int] = {
    CommitteeRole.DECISION_MAKER: 1,
    CommitteeRole.CHAMPION:       2,
    CommitteeRole.BLOCKER:        1,
    CommitteeRole.INFLUENCER:     1,
}


def pick_committee(
    candidates: list[BuyerProfile],
    target_size: int = 5,
) -> list[BuyerProfile]:
    """
    Select up to target_size contacts from candidates following slot quotas.

    Within each role bucket, higher committee_role_confidence wins.
    If a bucket has no candidates, its slot is left empty (no padding).

    Args:
        candidates:   List of BuyerProfile objects already assigned a committee_role.
        target_size:  Hard cap (default 5).

    Returns:
        List of selected BuyerProfile, length ≤ target_size.
    """
    if not candidates:
        return []

    # Bucket by role, sort each bucket by confidence descending
    buckets: dict[CommitteeRole, list[BuyerProfile]] = {role: [] for role in CommitteeRole}
    for profile in candidates:
        buckets[profile.committee_role].append(profile)
    for role in buckets:
        buckets[role].sort(key=lambda p: p.committee_role_confidence, reverse=True)

    selected: list[BuyerProfile] = []

    # Fill in role-priority order: DM first, then Champions, Blocker, Influencer
    for role, max_slots in _ROLE_SLOTS.items():
        available = buckets[role][:max_slots]
        selected.extend(available)
        if len(selected) >= target_size:
            break

    return selected[:target_size]
