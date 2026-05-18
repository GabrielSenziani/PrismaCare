import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    jwt_secret: str
    jwt_alg: str
    google_web_client_id: str
    whatsapp_provider: str
    evolution_api_url: str | None
    evolution_api_key: str | None
    evolution_instance_name: str | None
    expo_push_enabled: bool
    expo_push_api_url: str
    access_ttl_min: int
    refresh_ttl_days: int
    cors_allow_origins: list[str]
    enable_manual_monitor_endpoint: bool
    enable_whatsapp_test_endpoint: bool
    login_lockout_threshold: int
    login_lockout_minutes: int
    login_lockout_max_minutes: int
    rate_limit_login_per_min: int
    rate_limit_refresh_per_min: int
    rate_limit_api_per_min: int
    rate_limit_phone_send_per_min: int
    rate_limit_phone_verify_per_min: int
    monitor_tolerance_minutes: int
    monitor_scan_interval_minutes: int
    disable_scheduler: bool
    trust_proxy_headers: bool
    log_sensitive_payloads: bool
    email_lockout_threshold: int
    email_lockout_minutes: int
    email_lockout_max_minutes: int


def _load_dotenv_if_present() -> None:
    """Load .env from project root if present, without overriding existing env vars."""
    project_root = Path(__file__).resolve().parents[2]
    env_path = project_root / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _get_required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise RuntimeError(f"Invalid integer for {name}: {value}") from exc


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False

    raise RuntimeError(f"Invalid boolean for {name}: {value}")


def _get_optional(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def load_settings() -> Settings:
    origins_raw = os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:3000,http://localhost:8081,http://127.0.0.1:8081",
    )
    origins = [origin.strip() for origin in origins_raw.split(",") if origin.strip()]
    if not origins:
        raise RuntimeError("CORS_ALLOW_ORIGINS must define at least one origin")

    whatsapp_provider = os.getenv("WHATSAPP_PROVIDER", "simulation").strip().lower()
    if whatsapp_provider not in {"simulation", "evolution"}:
        raise RuntimeError("WHATSAPP_PROVIDER must be one of: simulation, evolution")

    return Settings(
        jwt_secret=_get_required("JWT_SECRET"),
        jwt_alg=os.getenv("JWT_ALG", "HS256"),
        google_web_client_id=_get_required("GOOGLE_WEB_CLIENT_ID"),
        whatsapp_provider=whatsapp_provider,
        evolution_api_url=_get_optional("EVOLUTION_API_URL"),
        evolution_api_key=_get_optional("EVOLUTION_API_KEY"),
        evolution_instance_name=_get_optional("EVOLUTION_INSTANCE_NAME"),
        expo_push_enabled=_get_bool("EXPO_PUSH_ENABLED", False),
        expo_push_api_url=os.getenv("EXPO_PUSH_API_URL", "https://exp.host/--/api/v2/push/send"),
        access_ttl_min=_get_int("ACCESS_TTL_MIN", 15),
        refresh_ttl_days=_get_int("REFRESH_TTL_DAYS", 14),
        cors_allow_origins=origins,
        enable_manual_monitor_endpoint=_get_bool("ENABLE_MANUAL_MONITOR_ENDPOINT", False),
        enable_whatsapp_test_endpoint=_get_bool("ENABLE_WHATSAPP_TEST_ENDPOINT", False),
        login_lockout_threshold=_get_int("LOGIN_LOCKOUT_THRESHOLD", 5),
        login_lockout_minutes=_get_int("LOGIN_LOCKOUT_MINUTES", 15),
        login_lockout_max_minutes=_get_int("LOGIN_LOCKOUT_MAX_MINUTES", 60),
        rate_limit_login_per_min=_get_int("RATE_LIMIT_LOGIN_PER_MIN", 10),
        rate_limit_refresh_per_min=_get_int("RATE_LIMIT_REFRESH_PER_MIN", 20),
        rate_limit_api_per_min=_get_int("RATE_LIMIT_API_PER_MIN", 120),
        rate_limit_phone_send_per_min=_get_int("RATE_LIMIT_PHONE_SEND_PER_MIN", 3),
        rate_limit_phone_verify_per_min=_get_int("RATE_LIMIT_PHONE_VERIFY_PER_MIN", 10),
        monitor_tolerance_minutes=_get_int("MONITOR_TOLERANCE_MINUTES", 5),
        monitor_scan_interval_minutes=_get_int("MONITOR_SCAN_INTERVAL_MINUTES", 5),
        disable_scheduler=_get_bool("DISABLE_SCHEDULER", False),
        trust_proxy_headers=_get_bool("TRUST_PROXY_HEADERS", True),
        log_sensitive_payloads=_get_bool("LOG_SENSITIVE_PAYLOADS", False),
        email_lockout_threshold=_get_int("EMAIL_LOCKOUT_THRESHOLD", 20),
        email_lockout_minutes=_get_int("EMAIL_LOCKOUT_MINUTES", 60),
        email_lockout_max_minutes=_get_int("EMAIL_LOCKOUT_MAX_MINUTES", 240),
    )


_load_dotenv_if_present()
settings = load_settings()
