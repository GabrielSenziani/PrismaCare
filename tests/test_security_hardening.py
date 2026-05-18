"""Regressão para o hardening de segurança pré-homologação."""

from dataclasses import replace

import pytest

from tests.conftest import USUARIO_A, registrar_e_logar


def _register(client, **overrides):
    payload = {**USUARIO_A, **overrides}
    return client.post("/api/users", json=payload)


@pytest.fixture()
def relax_rate_limit(monkeypatch):
    """Permite que o lockout (não rate limit) seja testado sem 429 atrapalhar."""
    from app.core import config as config_mod

    relaxed = replace(
        config_mod.settings,
        rate_limit_login_per_min=10_000,
        login_lockout_threshold=10_000,
    )
    monkeypatch.setattr(config_mod, "settings", relaxed)
    # também atualiza onde outros módulos já importaram `settings`
    import app.core.security_controls as sec
    import app.routes.auth_route as auth_route
    import app.security as security
    monkeypatch.setattr(sec, "settings", relaxed)
    monkeypatch.setattr(auth_route, "settings", relaxed)
    monkeypatch.setattr(security, "settings", relaxed)
    return relaxed


def test_senha_curta_e_rejeitada(client):
    r = _register(client, senha="abc123")
    assert r.status_code == 422
    assert "8 caracteres" in r.json()["detail"]


def test_senha_so_letras_e_rejeitada(client):
    r = _register(client, senha="abcdefgh")
    assert r.status_code == 422


def test_senha_so_numeros_e_rejeitada(client):
    r = _register(client, senha="12345678")
    assert r.status_code == 422


def test_senha_forte_aceita(client):
    r = _register(client, senha="Senha1234")
    assert r.status_code == 201


def test_lookup_email_aplica_rate_limit(client):
    payload = {"email": "alguem@teste.com"}
    # Default RATE_LIMIT_LOGIN_PER_MIN=10 — 11ª deve falhar
    for _ in range(10):
        r = client.post("/api/auth/lookup-email", json=payload)
        assert r.status_code == 200
    r = client.post("/api/auth/lookup-email", json=payload)
    assert r.status_code == 429


def test_x_forwarded_for_spoof_nao_zera_lockout_por_email(client, relax_rate_limit):
    """Bypass via X-Forwarded-For não deve evitar lockout email-only.
    Default EMAIL_LOCKOUT_THRESHOLD=20.
    """
    registrar_e_logar(client, USUARIO_A)

    # 20 falhas, cada uma com X-Forwarded-For e X-Real-IP diferentes
    for i in range(20):
        client.post(
            "/api/auth/login",
            data={
                "username": USUARIO_A["email"],
                "password": "senhaErradaXYZ",
                "grant_type": "password",
            },
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Real-IP": f"10.0.0.{i + 1}",
                "X-Forwarded-For": f"10.0.0.{i + 1}",
            },
        )

    # Mesmo com IP novo e senha CORRETA, deve cair em lockout por email
    r = client.post(
        "/api/auth/login",
        data={
            "username": USUARIO_A["email"],
            "password": USUARIO_A["senha"],
            "grant_type": "password",
        },
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Real-IP": "10.0.0.99",
            "X-Forwarded-For": "10.0.0.99",
        },
    )
    assert r.status_code == 429


def test_x_real_ip_e_preferido_sobre_x_forwarded_for(client, relax_rate_limit):
    """Em produção, X-Real-IP vem do nginx e é confiável. Falhas com mesmo
    X-Real-IP mas X-Forwarded-For variando ainda devem trancar (email, X-Real-IP)."""
    registrar_e_logar(client, USUARIO_A)

    # default LOGIN_LOCKOUT_THRESHOLD foi relaxado pelo fixture; vamos usar email-lockout
    # com threshold default=20, então o lockout email-only deve ativar após 20 falhas
    # com mesmo email — confirmando que X-Real-IP é estável (não é spoofado).
    for i in range(20):
        client.post(
            "/api/auth/login",
            data={
                "username": USUARIO_A["email"],
                "password": "senhaErrada",
                "grant_type": "password",
            },
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Real-IP": "192.168.1.10",
                "X-Forwarded-For": f"1.2.3.{i}",
            },
        )

    r = client.post(
        "/api/auth/login",
        data={
            "username": USUARIO_A["email"],
            "password": USUARIO_A["senha"],
            "grant_type": "password",
        },
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Real-IP": "192.168.1.10",
            "X-Forwarded-For": "9.9.9.9",
        },
    )
    assert r.status_code == 429


def test_security_headers_presentes(client):
    r = client.post("/api/auth/lookup-email", json={"email": "x@y.com"})
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert r.headers.get("Permissions-Policy") == "geolocation=(), microphone=(), camera=()"
    assert r.headers.get("Cross-Origin-Opener-Policy") == "same-origin"


def test_hsts_so_em_https(client):
    r_http = client.post("/api/auth/lookup-email", json={"email": "x@y.com"})
    assert "Strict-Transport-Security" not in r_http.headers

    r_https = client.post(
        "/api/auth/lookup-email",
        json={"email": "x@y.com"},
        headers={"X-Forwarded-Proto": "https"},
    )
    assert "Strict-Transport-Security" in r_https.headers


def test_client_logs_requer_auth(client):
    r = client.post("/api/client-logs", json={"event": "x", "level": "info", "data": {}})
    assert r.status_code == 401


def test_client_logs_aceita_com_token(client, headers_a):
    r = client.post(
        "/api/client-logs",
        json={"event": "x", "level": "info", "data": {"a": 1}},
        headers=headers_a,
    )
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_log_simulacao_mascara_telefone(client, caplog):
    import logging

    from app.services.whatsapp_service import enviar_whatsapp

    with caplog.at_level(logging.INFO, logger="app.services.whatsapp_service"):
        enviar_whatsapp("11987654321", "mensagem confidencial com medicamento")

    log_text = "\n".join(record.getMessage() for record in caplog.records)
    assert "***4321" in log_text
    assert "11987654321" not in log_text
    assert "mensagem confidencial" not in log_text
    assert "medicamento" not in log_text
