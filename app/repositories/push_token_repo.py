import sqlite3
from datetime import datetime


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def upsert_push_token(
    conn: sqlite3.Connection,
    user_id: int,
    expo_push_token: str,
    platform: str,
    device_name: str | None,
) -> dict:
    now = _now_str()
    existing = conn.execute(
        "SELECT * FROM push_tokens WHERE expo_push_token = ?",
        (expo_push_token,),
    ).fetchone()

    if existing:
        conn.execute(
            """
            UPDATE push_tokens
            SET id_usuario = ?, platform = ?, device_name = ?, ativo = 1, ultimo_erro = NULL, updated_at = ?
            WHERE expo_push_token = ?
            """,
            (user_id, platform, device_name, now, expo_push_token),
        )
    else:
        conn.execute(
            """
            INSERT INTO push_tokens (
                id_usuario, expo_push_token, platform, device_name, ativo, ultimo_erro, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 1, NULL, ?, ?)
            """,
            (user_id, expo_push_token, platform, device_name, now, now),
        )
    conn.commit()
    return buscar_push_token_por_valor(conn, expo_push_token)


def buscar_push_token_por_valor(conn: sqlite3.Connection, expo_push_token: str) -> dict | None:
    row = conn.execute(
        "SELECT * FROM push_tokens WHERE expo_push_token = ?",
        (expo_push_token,),
    ).fetchone()
    return _converter_push_token(row) if row else None


def listar_push_tokens_ativos(conn: sqlite3.Connection, user_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT *
        FROM push_tokens
        WHERE id_usuario = ? AND ativo = 1
        ORDER BY id ASC
        """,
        (user_id,),
    ).fetchall()
    return [_converter_push_token(row) for row in rows]


def desativar_push_token(conn: sqlite3.Connection, user_id: int, expo_push_token: str) -> dict | None:
    cursor = conn.execute(
        """
        UPDATE push_tokens
        SET ativo = 0, updated_at = ?
        WHERE id_usuario = ? AND expo_push_token = ?
        """,
        (_now_str(), user_id, expo_push_token),
    )
    conn.commit()
    if cursor.rowcount == 0:
        return None
    return buscar_push_token_por_valor(conn, expo_push_token)


def marcar_push_token_inativo_por_id(
    conn: sqlite3.Connection,
    push_token_id: int,
    ultimo_erro: str | None,
) -> dict | None:
    conn.execute(
        """
        UPDATE push_tokens
        SET ativo = 0, ultimo_erro = ?, updated_at = ?
        WHERE id = ?
        """,
        (ultimo_erro, _now_str(), push_token_id),
    )
    conn.commit()
    return buscar_push_token_por_id(conn, push_token_id)


def buscar_push_token_por_id(conn: sqlite3.Connection, push_token_id: int) -> dict | None:
    row = conn.execute(
        "SELECT * FROM push_tokens WHERE id = ?",
        (push_token_id,),
    ).fetchone()
    return _converter_push_token(row) if row else None


def buscar_push_attempt(
    conn: sqlite3.Connection,
    confirmacao_id: int,
    push_token_id: int,
) -> dict | None:
    row = conn.execute(
        """
        SELECT *
        FROM dose_overdue_push_attempts
        WHERE id_confirmacao = ? AND id_push_token = ?
        """,
        (confirmacao_id, push_token_id),
    ).fetchone()
    return dict(row) if row else None


def registrar_push_attempt(
    conn: sqlite3.Connection,
    confirmacao_id: int,
    push_token_id: int,
    status_envio: str,
    expo_ticket_id: str | None,
    erro: str | None,
) -> dict:
    now = _now_str()
    conn.execute(
        """
        INSERT INTO dose_overdue_push_attempts (
            id_confirmacao,
            id_push_token,
            status_envio,
            expo_ticket_id,
            erro,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id_confirmacao, id_push_token)
        DO UPDATE SET
            status_envio = excluded.status_envio,
            expo_ticket_id = excluded.expo_ticket_id,
            erro = excluded.erro,
            updated_at = excluded.updated_at
        """,
        (confirmacao_id, push_token_id, status_envio, expo_ticket_id, erro, now, now),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT *
        FROM dose_overdue_push_attempts
        WHERE id_confirmacao = ? AND id_push_token = ?
        """,
        (confirmacao_id, push_token_id),
    ).fetchone()
    return dict(row)


def _converter_push_token(row: sqlite3.Row) -> dict:
    data = dict(row)
    data["ativo"] = bool(data["ativo"])
    return data
