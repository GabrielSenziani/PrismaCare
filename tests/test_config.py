from app.core.config import load_settings


def test_load_settings_uses_monitor_defaults(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-pytest-only")
    monkeypatch.setenv("GOOGLE_WEB_CLIENT_ID", "test-google-web-client-id.apps.googleusercontent.com")
    monkeypatch.delenv("MONITOR_TOLERANCE_MINUTES", raising=False)
    monkeypatch.delenv("MONITOR_SCAN_INTERVAL_MINUTES", raising=False)

    settings = load_settings()

    assert settings.monitor_tolerance_minutes == 5
    assert settings.monitor_scan_interval_minutes == 5


def test_load_settings_accepts_monitor_env_overrides(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-pytest-only")
    monkeypatch.setenv("GOOGLE_WEB_CLIENT_ID", "test-google-web-client-id.apps.googleusercontent.com")
    monkeypatch.setenv("MONITOR_TOLERANCE_MINUTES", "1")
    monkeypatch.setenv("MONITOR_SCAN_INTERVAL_MINUTES", "2")

    settings = load_settings()

    assert settings.monitor_tolerance_minutes == 1
    assert settings.monitor_scan_interval_minutes == 2
