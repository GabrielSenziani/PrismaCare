import os
import sqlite3

# Deve ser setado ANTES de qualquer import do app para que load_settings() leia corretamente
os.environ.setdefault("DISABLE_SCHEDULER", "true")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-pytest-only")
os.environ.setdefault("GOOGLE_WEB_CLIENT_ID", "test-google-web-client-id.apps.googleusercontent.com")
os.environ.setdefault("WHATSAPP_PROVIDER", "simulation")

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db

USUARIO_A = {
    "nome": "Ana Teste",
    "email": "ana@teste.com",
    "telefone": "11999990000",
    "senha": "senha123",
}
USUARIO_B = {
    "nome": "Bruno Teste",
    "email": "bruno@teste.com",
    "telefone": "11999991111",
    "senha": "senha456",
}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    # Reseta rate limiter em memória para evitar 429 entre testes
    from app.core.rate_limit import rate_limiter
    rate_limiter._hits.clear()

    db_path = str(tmp_path / "test.db")
    monkeypatch.setattr("app.database.DATABASE_PATH", db_path)

    # Importar init_db APÓS o monkeypatch para garantir uso do banco de teste
    from app.database import init_db
    init_db()

    def override_get_db():
        conn = sqlite3.connect(db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
        finally:
            conn.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


def registrar_e_logar(client, dados: dict) -> dict:
    """Registra usuário e retorna dict com access_token e refresh_token."""
    res = client.post("/api/users", json=dados)
    assert res.status_code == 201, f"Cadastro falhou: {res.text}"

    r = client.post(
        "/api/auth/login",
        data={
            "username": dados["email"],
            "password": dados["senha"],
            "grant_type": "password",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 200, f"Login falhou: {r.text}"
    return r.json()


@pytest.fixture()
def tokens_a(client):
    return registrar_e_logar(client, USUARIO_A)


@pytest.fixture()
def headers_a(tokens_a):
    return {"Authorization": f"Bearer {tokens_a['access_token']}"}


@pytest.fixture()
def tokens_b(client):
    return registrar_e_logar(client, USUARIO_B)


@pytest.fixture()
def headers_b(tokens_b):
    return {"Authorization": f"Bearer {tokens_b['access_token']}"}
