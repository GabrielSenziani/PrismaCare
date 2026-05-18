from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo


DEFAULT_USER_TIMEZONE = "America/Sao_Paulo"


def get_user_timezone(timezone_name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name or DEFAULT_USER_TIMEZONE)
    except Exception:
        return ZoneInfo(DEFAULT_USER_TIMEZONE)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_confirmation_datetime(value: str | None, timezone_name: str | None) -> datetime | None:
    if not value:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"

    parsed: datetime | None = None
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        for fmt in (
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%dT%H:%M",
        ):
            try:
                parsed = datetime.strptime(normalized, fmt)
                break
            except ValueError:
                continue

    if parsed is None:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=get_user_timezone(timezone_name))

    return parsed


def confirmation_datetime_for_user(value: str | None, timezone_name: str | None) -> datetime | None:
    parsed = parse_confirmation_datetime(value, timezone_name)
    if parsed is None:
        return None
    return parsed.astimezone(get_user_timezone(timezone_name))


def confirmation_datetime_iso_for_user(value: str | None, timezone_name: str | None) -> str | None:
    localized = confirmation_datetime_for_user(value, timezone_name)
    if localized is None:
        return None
    return localized.isoformat()
