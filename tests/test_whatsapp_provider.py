import requests

from app.core.config import settings
from app.services.whatsapp_service import enviar_whatsapp, normalizar_telefone_whatsapp


def _set_settings(**overrides):
    previous = {}
    for key, value in overrides.items():
        previous[key] = getattr(settings, key)
        object.__setattr__(settings, key, value)
    return previous


def _restore_settings(previous):
    for key, value in previous.items():
        object.__setattr__(settings, key, value)


def test_normaliza_telefone_whatsapp():
    assert normalizar_telefone_whatsapp("(11) 99999-9999") == "5511999999999"
    assert normalizar_telefone_whatsapp("11999999999") == "5511999999999"
    assert normalizar_telefone_whatsapp("5511999999999") == "5511999999999"
    assert normalizar_telefone_whatsapp("123") is None


def test_provider_simulation_retorna_enviado():
    previous = _set_settings(whatsapp_provider="simulation")
    try:
        result = enviar_whatsapp("11999999999", "Teste PrismaCare")
        assert result["provider"] == "simulation"
        assert result["status_envio"] == "ENVIADO"
        assert result["raw_response"] is None
    finally:
        _restore_settings(previous)


def test_provider_evolution_sucesso_http(monkeypatch):
    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"key": {"id": "msg-1"}}

    def fake_post(url, json, headers, timeout):
        assert url.endswith("/message/sendText/prismacare")
        assert json["number"] == "5511999999999"
        assert json["text"] == "Teste PrismaCare"
        assert headers["apikey"] == "secret-key"
        assert timeout == 10
        return FakeResponse()

    monkeypatch.setattr("app.services.whatsapp_service.requests.post", fake_post)
    previous = _set_settings(
        whatsapp_provider="evolution",
        evolution_api_url="http://127.0.0.1:8080",
        evolution_api_key="secret-key",
        evolution_instance_name="prismacare",
    )
    try:
        result = enviar_whatsapp("(11) 99999-9999", "Teste PrismaCare")
        assert result["provider"] == "evolution"
        assert result["status_envio"] == "ENVIADO"
        assert result["raw_response"] == {"key": {"id": "msg-1"}}
    finally:
        _restore_settings(previous)


def test_provider_evolution_timeout(monkeypatch):
    def fake_post(*args, **kwargs):
        raise requests.Timeout("timeout")

    monkeypatch.setattr("app.services.whatsapp_service.requests.post", fake_post)
    previous = _set_settings(
        whatsapp_provider="evolution",
        evolution_api_url="http://127.0.0.1:8080",
        evolution_api_key="secret-key",
        evolution_instance_name="prismacare",
    )
    try:
        result = enviar_whatsapp("11999999999", "Teste PrismaCare")
        assert result["provider"] == "evolution"
        assert result["status_envio"] == "FALHA"
        assert "Timeout" in result["error"]
    finally:
        _restore_settings(previous)


def test_provider_evolution_erro_conexao(monkeypatch):
    def fake_post(*args, **kwargs):
        raise requests.ConnectionError("offline")

    monkeypatch.setattr("app.services.whatsapp_service.requests.post", fake_post)
    previous = _set_settings(
        whatsapp_provider="evolution",
        evolution_api_url="http://127.0.0.1:8080",
        evolution_api_key="secret-key",
        evolution_instance_name="prismacare",
    )
    try:
        result = enviar_whatsapp("11999999999", "Teste PrismaCare")
        assert result["provider"] == "evolution"
        assert result["status_envio"] == "FALHA"
        assert "Erro de rede" in result["error"]
    finally:
        _restore_settings(previous)


def test_provider_evolution_http_inesperado(monkeypatch):
    class FakeResponse:
        status_code = 500
        text = "boom"

        @staticmethod
        def json():
            return {"error": "boom"}

    monkeypatch.setattr("app.services.whatsapp_service.requests.post", lambda *args, **kwargs: FakeResponse())
    previous = _set_settings(
        whatsapp_provider="evolution",
        evolution_api_url="http://127.0.0.1:8080",
        evolution_api_key="secret-key",
        evolution_instance_name="prismacare",
    )
    try:
        result = enviar_whatsapp("11999999999", "Teste PrismaCare")
        assert result["provider"] == "evolution"
        assert result["status_envio"] == "FALHA"
        assert result["raw_response"] == {"error": "boom"}
        assert "HTTP 500" in result["error"]
    finally:
        _restore_settings(previous)


def test_provider_evolution_numero_invalido():
    previous = _set_settings(
        whatsapp_provider="evolution",
        evolution_api_url="http://127.0.0.1:8080",
        evolution_api_key="secret-key",
        evolution_instance_name="prismacare",
    )
    try:
        result = enviar_whatsapp("123", "Teste PrismaCare")
        assert result["provider"] == "evolution"
        assert result["status_envio"] == "FALHA"
        assert "Telefone inválido" in result["error"]
    finally:
        _restore_settings(previous)


def test_post_whatsapp_test_send_flag_desligada_retorna_403(client, headers_a):
    previous = _set_settings(enable_whatsapp_test_endpoint=False)
    try:
        response = client.post(
            "/api/whatsapp/test-send",
            json={"telefone": "11999999999", "mensagem": "Teste PrismaCare"},
            headers=headers_a,
        )
        assert response.status_code == 403
    finally:
        _restore_settings(previous)


def test_post_whatsapp_test_send_flag_ligada_retorna_payload_padronizado(client, headers_a):
    previous = _set_settings(enable_whatsapp_test_endpoint=True, whatsapp_provider="simulation")
    try:
        response = client.post(
            "/api/whatsapp/test-send",
            json={"telefone": "11999999999", "mensagem": "Teste PrismaCare"},
            headers=headers_a,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["provider"] == "simulation"
        assert body["status_envio"] == "ENVIADO"
    finally:
        _restore_settings(previous)


def test_get_whatsapp_status_autenticado_nao_expoe_api_key(client, headers_a):
    previous = _set_settings(
        whatsapp_provider="evolution",
        evolution_api_url="http://127.0.0.1:8080",
        evolution_api_key="secret-key",
        evolution_instance_name="prismacare",
        enable_whatsapp_test_endpoint=False,
    )
    try:
        response = client.get("/api/whatsapp/status", headers=headers_a)
        assert response.status_code == 200
        body = response.json()
        assert body["provider"] == "evolution"
        assert body["configured"] is True
        assert body["api_url"] == "http://127.0.0.1:8080"
        assert body["instance_name"] == "prismacare"
        assert body["test_endpoint_enabled"] is False
        assert "EVOLUTION_API_KEY" not in body
        assert "api_key" not in body
    finally:
        _restore_settings(previous)


def test_monitor_com_provider_evolution_atualiza_notificacao(client, headers_a, monkeypatch):
    from app.services.monitor_service import varrer_e_notificar
    from tests.test_whatsapp_simulado import _criar_stack, _criar_confirmacao_vencida

    _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)
    _criar_confirmacao_vencida(client, headers_a, agend_id)

    calls = []

    def fake_send(telefone, mensagem):
        calls.append((telefone, mensagem))
        return {
            "provider": "evolution",
            "status_envio": "ENVIADO",
            "data_hora_envio": "2026-05-16 10:30:00",
            "raw_response": {"id": "msg-1"},
        }

    monkeypatch.setattr("app.services.monitor_service.enviar_whatsapp", fake_send)

    result = varrer_e_notificar()
    assert result["notificacoes_criadas"] == 1
    assert result["notificacoes_enviadas"] == 1
    assert len(calls) == 1
    assert calls[0][0] == "11988880001"
    mensagem = calls[0][1]
    assert mensagem.startswith(
        "[PrismaCare] Atenção: Ana Teste ainda não confirmou a dose de Paracetamol (750mg) das "
    )
    assert mensagem.endswith(
        ".\nPor favor, verifique se ele conseguiu tomar o medicamento."
    )

    notificacoes = client.get("/api/notificacoes", headers=headers_a).json()
    assert len(notificacoes) == 1
    assert notificacoes[0]["status_envio"] == "ENVIADO"
    assert notificacoes[0]["tipo_mensagem"] == "WHATSAPP"
