from datetime import datetime, timedelta, timezone

from app.database import get_connection
from app.repositories import user_repo


def _mock_send_success(*_args, **_kwargs):
    return {
        "provider": "simulation",
        "status_envio": "ENVIADO",
        "data_hora_envio": "2026-05-17 10:30:00",
        "raw_response": None,
    }


def _active_code_for(phone_e164: str) -> dict:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT *
            FROM phone_verification_codes
            WHERE phone_e164 = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (phone_e164,),
        ).fetchone()
        assert row is not None
        return dict(row)


def test_phone_auth_creates_new_account_after_valid_code(client, monkeypatch):
    monkeypatch.setattr("app.routes.auth_route.generate_phone_code", lambda: "123456")
    monkeypatch.setattr("app.routes.auth_route.enviar_whatsapp", _mock_send_success)

    lookup = client.post("/api/auth/lookup-phone", json={"ddd": "11", "numero": "954154792"})
    assert lookup.status_code == 200
    assert lookup.json()["formatted_phone"] == "+55 11 95415-4792"

    send = client.post("/api/auth/send-phone-code", json={"ddd": "11", "numero": "954154792"})
    assert send.status_code == 200

    verify = client.post("/api/auth/verify-phone-code", json={"ddd": "11", "numero": "954154792", "codigo": "123456"})
    assert verify.status_code == 200
    body = verify.json()
    assert body["authenticated"] is False
    assert body["needs_name"] is True
    assert body["verification_token"]

    complete = client.post(
        "/api/auth/complete-phone-registration",
        json={"verification_token": body["verification_token"], "nome": "Cauê"},
    )
    assert complete.status_code == 200
    auth = complete.json()
    assert auth["user"]["email"] is None

    me = client.get("/api/users/me", headers={"Authorization": f"Bearer {auth['access_token']}"})
    assert me.status_code == 200
    profile = me.json()
    assert profile["nome"] == "Cauê"
    assert profile["telefone"] == "+55 11 95415-4792"
    assert profile["email"] is None
    assert profile["phone_verified_at"] is not None


def test_phone_auth_logs_existing_user_in_and_allows_refresh_logout(client, monkeypatch):
    with get_connection() as conn:
        user_repo.criar_usuario(
            conn,
            nome="Conta Telefone",
            telefone="+55 11 95415-4792",
            email=None,
            senha=None,
            data_nascimento=None,
            auth_provider="phone",
            phone_e164="5511954154792",
        )

    monkeypatch.setattr("app.routes.auth_route.generate_phone_code", lambda: "654321")
    monkeypatch.setattr("app.routes.auth_route.enviar_whatsapp", _mock_send_success)

    send = client.post("/api/auth/send-phone-code", json={"ddd": "11", "numero": "954154792"})
    assert send.status_code == 200

    verify = client.post("/api/auth/verify-phone-code", json={"ddd": "11", "numero": "954154792", "codigo": "654321"})
    assert verify.status_code == 200
    auth = verify.json()
    assert auth["access_token"]
    assert auth["refresh_token"]

    refresh = client.post("/api/auth/refresh", json={"refresh_token": auth["refresh_token"]})
    assert refresh.status_code == 200

    logout = client.post(
        "/api/auth/logout",
        json={"refresh_token": refresh.json()["refresh_token"]},
        headers={"Authorization": f"Bearer {auth['access_token']}"},
    )
    assert logout.status_code == 200


def test_complete_phone_registration_requires_valid_verification_token(client):
    response = client.post(
        "/api/auth/complete-phone-registration",
        json={"verification_token": "invalid-token", "nome": "Cauê"},
    )
    assert response.status_code == 401


def test_phone_code_invalid_attempts_fail(client, monkeypatch):
    monkeypatch.setattr("app.routes.auth_route.generate_phone_code", lambda: "111222")
    monkeypatch.setattr("app.routes.auth_route.enviar_whatsapp", _mock_send_success)

    send = client.post("/api/auth/send-phone-code", json={"ddd": "11", "numero": "954154792"})
    assert send.status_code == 200

    wrong = client.post("/api/auth/verify-phone-code", json={"ddd": "11", "numero": "954154792", "codigo": "000000"})
    assert wrong.status_code == 401

    code = _active_code_for("5511954154792")
    assert code["failed_attempts"] == 1
    assert code["consumed_at"] is None


def test_phone_code_expired_fails(client, monkeypatch):
    monkeypatch.setattr("app.routes.auth_route.generate_phone_code", lambda: "333444")
    monkeypatch.setattr("app.routes.auth_route.enviar_whatsapp", _mock_send_success)

    send = client.post("/api/auth/send-phone-code", json={"ddd": "11", "numero": "954154792"})
    assert send.status_code == 200

    with get_connection() as conn:
        conn.execute(
            "UPDATE phone_verification_codes SET expires_at = ? WHERE phone_e164 = ?",
            ((datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(), "5511954154792"),
        )
        conn.commit()

    expired = client.post("/api/auth/verify-phone-code", json={"ddd": "11", "numero": "954154792", "codigo": "333444"})
    assert expired.status_code == 401


def test_phone_resend_invalidates_previous_code(client, monkeypatch):
    codes = iter(["111111", "222222"])
    monkeypatch.setattr("app.routes.auth_route.generate_phone_code", lambda: next(codes))
    monkeypatch.setattr("app.routes.auth_route.enviar_whatsapp", _mock_send_success)

    first = client.post("/api/auth/send-phone-code", json={"ddd": "11", "numero": "954154792"})
    assert first.status_code == 200
    first_code = _active_code_for("5511954154792")

    second = client.post("/api/auth/send-phone-code", json={"ddd": "11", "numero": "954154792"})
    assert second.status_code == 200

    with get_connection() as conn:
        first_row = conn.execute("SELECT * FROM phone_verification_codes WHERE id = ?", (first_code["id"],)).fetchone()
        assert first_row is not None
        assert first_row["invalidated_at"] is not None

    old_verify = client.post("/api/auth/verify-phone-code", json={"ddd": "11", "numero": "954154792", "codigo": "111111"})
    assert old_verify.status_code == 401

    new_verify = client.post("/api/auth/verify-phone-code", json={"ddd": "11", "numero": "954154792", "codigo": "222222"})
    assert new_verify.status_code == 200


def test_phone_send_rate_limit_blocks_abuse(client, monkeypatch):
    from app.core.config import settings

    previous = settings.rate_limit_phone_send_per_min
    object.__setattr__(settings, "rate_limit_phone_send_per_min", 1)
    monkeypatch.setattr("app.routes.auth_route.generate_phone_code", lambda: "123123")
    monkeypatch.setattr("app.routes.auth_route.enviar_whatsapp", _mock_send_success)
    try:
        first = client.post("/api/auth/send-phone-code", json={"ddd": "11", "numero": "954154792"})
        assert first.status_code == 200
        second = client.post("/api/auth/send-phone-code", json={"ddd": "11", "numero": "954154792"})
        assert second.status_code == 429
    finally:
        object.__setattr__(settings, "rate_limit_phone_send_per_min", previous)


def test_phone_verify_rate_limit_blocks_abuse(client, monkeypatch):
    from app.core.config import settings

    previous = settings.rate_limit_phone_verify_per_min
    object.__setattr__(settings, "rate_limit_phone_verify_per_min", 1)
    monkeypatch.setattr("app.routes.auth_route.generate_phone_code", lambda: "999888")
    monkeypatch.setattr("app.routes.auth_route.enviar_whatsapp", _mock_send_success)
    try:
        send = client.post("/api/auth/send-phone-code", json={"ddd": "11", "numero": "954154792"})
        assert send.status_code == 200

        first = client.post("/api/auth/verify-phone-code", json={"ddd": "11", "numero": "954154792", "codigo": "000000"})
        assert first.status_code == 401
        second = client.post("/api/auth/verify-phone-code", json={"ddd": "11", "numero": "954154792", "codigo": "000000"})
        assert second.status_code == 429
    finally:
        object.__setattr__(settings, "rate_limit_phone_verify_per_min", previous)


def test_phone_send_reports_whatsapp_failure(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.auth_route.enviar_whatsapp",
        lambda *_args, **_kwargs: {
            "provider": "evolution",
            "status_envio": "FALHA",
            "data_hora_envio": "2026-05-17 10:30:00",
            "raw_response": None,
            "error": "offline",
        },
    )

    response = client.post("/api/auth/send-phone-code", json={"ddd": "11", "numero": "954154792"})
    assert response.status_code == 503
