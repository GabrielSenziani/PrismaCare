from app.core.config import settings
from app.database import get_connection
from tests.test_whatsapp_simulado import _criar_confirmacao_vencida, _criar_stack


def _set_settings(**overrides):
    previous = {}
    for key, value in overrides.items():
        previous[key] = getattr(settings, key)
        object.__setattr__(settings, key, value)
    return previous


def _restore_settings(previous):
    for key, value in previous.items():
        object.__setattr__(settings, key, value)


def test_register_push_token_sem_duplicar(client, headers_a):
    payload = {
        "expo_push_token": "ExponentPushToken[token-1]",
        "platform": "android",
        "device_name": "Android device",
    }

    first = client.post("/api/push-tokens", json=payload, headers=headers_a)
    assert first.status_code == 200
    second = client.post("/api/push-tokens", json=payload, headers=headers_a)
    assert second.status_code == 200

    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM push_tokens WHERE expo_push_token = ?", (payload["expo_push_token"],)).fetchall()
        assert len(rows) == 1
        assert rows[0]["ativo"] == 1


def test_unregister_push_token_desativa_registro(client, headers_a):
    payload = {
        "expo_push_token": "ExponentPushToken[token-1]",
        "platform": "android",
        "device_name": "Android device",
    }
    client.post("/api/push-tokens", json=payload, headers=headers_a)

    response = client.post(
        "/api/push-tokens/unregister",
        json={"expo_push_token": payload["expo_push_token"]},
        headers=headers_a,
    )
    assert response.status_code == 200
    assert response.json()["ativo"] is False


def test_monitor_envia_push_quando_ha_token_ativo(client, headers_a, monkeypatch):
    from app.services.monitor_service import varrer_e_notificar

    previous = _set_settings(expo_push_enabled=True)
    try:
        _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)
        confirmacao_id = _criar_confirmacao_vencida(client, headers_a, agend_id)
        client.post(
            "/api/push-tokens",
            json={
                "expo_push_token": "ExponentPushToken[token-1]",
                "platform": "android",
                "device_name": "Android device",
            },
            headers=headers_a,
        )

        push_calls = []
        monkeypatch.setattr(
            "app.services.monitor_service.enviar_push_dose_atrasada",
            lambda **kwargs: push_calls.append(kwargs) or {
                "status_envio": "ENVIADO",
                "data_hora_envio": "2026-05-18 10:30:00",
                "expo_ticket_id": "ticket-1",
                "erro": None,
                "invalid_token": False,
                "raw_response": {"data": [{"status": "ok", "id": "ticket-1"}]},
            },
        )
        monkeypatch.setattr(
            "app.services.monitor_service.enviar_whatsapp",
            lambda *_args, **_kwargs: {
                "provider": "simulation",
                "status_envio": "ENVIADO",
                "data_hora_envio": "2026-05-18 10:30:00",
                "raw_response": None,
            },
        )

        result = varrer_e_notificar()

        assert result["push_notificacoes_enviadas"] == 1
        assert len(push_calls) == 1
        assert push_calls[0]["confirmacao_id"] == confirmacao_id

        with get_connection() as conn:
            attempts = conn.execute(
                "SELECT * FROM dose_overdue_push_attempts WHERE id_confirmacao = ?",
                (confirmacao_id,),
            ).fetchall()
            assert len(attempts) == 1
            assert attempts[0]["status_envio"] == "ENVIADO"
    finally:
        _restore_settings(previous)


def test_monitor_nao_duplica_push_na_segunda_varredura(client, headers_a, monkeypatch):
    from app.services.monitor_service import varrer_e_notificar

    previous = _set_settings(expo_push_enabled=True)
    try:
        _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)
        _criar_confirmacao_vencida(client, headers_a, agend_id)
        client.post(
            "/api/push-tokens",
            json={
                "expo_push_token": "ExponentPushToken[token-1]",
                "platform": "android",
                "device_name": "Android device",
            },
            headers=headers_a,
        )

        push_calls = []
        monkeypatch.setattr(
            "app.services.monitor_service.enviar_push_dose_atrasada",
            lambda **kwargs: push_calls.append(kwargs) or {
                "status_envio": "ENVIADO",
                "data_hora_envio": "2026-05-18 10:30:00",
                "expo_ticket_id": "ticket-1",
                "erro": None,
                "invalid_token": False,
                "raw_response": None,
            },
        )
        monkeypatch.setattr(
            "app.services.monitor_service.enviar_whatsapp",
            lambda *_args, **_kwargs: {
                "provider": "simulation",
                "status_envio": "ENVIADO",
                "data_hora_envio": "2026-05-18 10:30:00",
                "raw_response": None,
            },
        )

        first = varrer_e_notificar()
        second = varrer_e_notificar()

        assert first["push_notificacoes_enviadas"] == 1
        assert second["push_notificacoes_enviadas"] == 0
        assert len(push_calls) == 1
    finally:
        _restore_settings(previous)


def test_monitor_com_token_invalido_desativa_push_token(client, headers_a, monkeypatch):
    from app.services.monitor_service import varrer_e_notificar

    previous = _set_settings(expo_push_enabled=True)
    try:
        _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)
        confirmacao_id = _criar_confirmacao_vencida(client, headers_a, agend_id)
        client.post(
            "/api/push-tokens",
            json={
                "expo_push_token": "ExponentPushToken[token-1]",
                "platform": "android",
                "device_name": "Android device",
            },
            headers=headers_a,
        )

        monkeypatch.setattr(
            "app.services.monitor_service.enviar_push_dose_atrasada",
            lambda **_kwargs: {
                "status_envio": "FALHA",
                "data_hora_envio": "2026-05-18 10:30:00",
                "expo_ticket_id": None,
                "erro": "Expo token inválido ou dispositivo não registrado",
                "invalid_token": True,
                "raw_response": None,
            },
        )
        monkeypatch.setattr(
            "app.services.monitor_service.enviar_whatsapp",
            lambda *_args, **_kwargs: {
                "provider": "simulation",
                "status_envio": "ENVIADO",
                "data_hora_envio": "2026-05-18 10:30:00",
                "raw_response": None,
            },
        )

        result = varrer_e_notificar()
        assert result["push_notificacoes_enviadas"] == 0

        with get_connection() as conn:
            token = conn.execute("SELECT * FROM push_tokens WHERE expo_push_token = ?", ("ExponentPushToken[token-1]",)).fetchone()
            attempt = conn.execute(
                "SELECT * FROM dose_overdue_push_attempts WHERE id_confirmacao = ?",
                (confirmacao_id,),
            ).fetchone()
            assert token["ativo"] == 0
            assert "inválido" in token["ultimo_erro"]
            assert attempt["status_envio"] == "FALHA"
    finally:
        _restore_settings(previous)


def test_monitor_sem_push_token_nao_quebra(client, headers_a, monkeypatch):
    from app.services.monitor_service import varrer_e_notificar

    previous = _set_settings(expo_push_enabled=True)
    try:
        _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)
        _criar_confirmacao_vencida(client, headers_a, agend_id)

        push_calls = []
        monkeypatch.setattr(
            "app.services.monitor_service.enviar_push_dose_atrasada",
            lambda **kwargs: push_calls.append(kwargs) or {},
        )
        monkeypatch.setattr(
            "app.services.monitor_service.enviar_whatsapp",
            lambda *_args, **_kwargs: {
                "provider": "simulation",
                "status_envio": "ENVIADO",
                "data_hora_envio": "2026-05-18 10:30:00",
                "raw_response": None,
            },
        )

        result = varrer_e_notificar()

        assert result["confirmacoes_atualizadas"] == 1
        assert result["push_notificacoes_enviadas"] == 0
        assert push_calls == []
    finally:
        _restore_settings(previous)
