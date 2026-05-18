import requests

from app.core.config import settings
from app.services.push_notification_service import enviar_push_dose_atrasada


def _set_settings(**overrides):
    previous = {}
    for key, value in overrides.items():
        previous[key] = getattr(settings, key)
        object.__setattr__(settings, key, value)
    return previous


def _restore_settings(previous):
    for key, value in previous.items():
        object.__setattr__(settings, key, value)


def test_push_provider_retorna_enviado_quando_expo_aceita(monkeypatch):
    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"data": [{"status": "ok", "id": "ticket-1"}]}

    def fake_post(url, json, headers, timeout):
        assert url == "https://exp.host/--/api/v2/push/send"
        assert json[0]["to"] == "ExponentPushToken[token-1]"
        assert json[0]["title"] == "Medicamento atrasado"
        assert json[0]["data"]["kind"] == "dose-overdue"
        assert timeout == 10
        return FakeResponse()

    monkeypatch.setattr("app.services.push_notification_service.requests.post", fake_post)
    previous = _set_settings(expo_push_enabled=True, expo_push_api_url="https://exp.host/--/api/v2/push/send")
    try:
        result = enviar_push_dose_atrasada(
            expo_push_token="ExponentPushToken[token-1]",
            medicamento="Losartana",
            dosagem="50mg",
            horario_previsto="2026-05-18 10:00:00",
            confirmacao_id=1,
            medicamento_id=2,
        )
        assert result["status_envio"] == "ENVIADO"
        assert result["expo_ticket_id"] == "ticket-1"
        assert result["erro"] is None
        assert result["invalid_token"] is False
    finally:
        _restore_settings(previous)


def test_push_provider_marca_device_not_registered(monkeypatch):
    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {
                "data": [
                    {
                        "status": "error",
                        "message": "Device not registered",
                        "details": {"error": "DeviceNotRegistered"},
                    }
                ]
            }

    monkeypatch.setattr("app.services.push_notification_service.requests.post", lambda *args, **kwargs: FakeResponse())
    previous = _set_settings(expo_push_enabled=True, expo_push_api_url="https://exp.host/--/api/v2/push/send")
    try:
        result = enviar_push_dose_atrasada(
            expo_push_token="ExponentPushToken[token-1]",
            medicamento="Losartana",
            dosagem="50mg",
            horario_previsto="2026-05-18 10:00:00",
            confirmacao_id=1,
            medicamento_id=2,
        )
        assert result["status_envio"] == "FALHA"
        assert result["invalid_token"] is True
        assert "inválido" in result["erro"]
    finally:
        _restore_settings(previous)


def test_push_provider_trata_timeout(monkeypatch):
    monkeypatch.setattr(
        "app.services.push_notification_service.requests.post",
        lambda *args, **kwargs: (_ for _ in ()).throw(requests.Timeout("timeout")),
    )
    previous = _set_settings(expo_push_enabled=True, expo_push_api_url="https://exp.host/--/api/v2/push/send")
    try:
        result = enviar_push_dose_atrasada(
            expo_push_token="ExponentPushToken[token-1]",
            medicamento="Losartana",
            dosagem="50mg",
            horario_previsto="2026-05-18 10:00:00",
            confirmacao_id=1,
            medicamento_id=2,
        )
        assert result["status_envio"] == "FALHA"
        assert "Timeout" in result["erro"]
    finally:
        _restore_settings(previous)
