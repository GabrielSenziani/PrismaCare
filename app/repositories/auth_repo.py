import sqlite3
from datetime import datetime, timezone


def criar_refresh_token(
    conn: sqlite3.Connection,
    user_id: int,
    session_id: str,
    token_hash: str,
    expires_at: str,
    ip: str | None,
    user_agent: str | None,
) -> None:
    conn.execute(
        """INSERT INTO refresh_tokens
           (user_id, session_id, token_hash, expires_at, revoked, created_at, ip, user_agent)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?)""",
        (user_id, session_id, token_hash, expires_at, _now_iso(), ip, user_agent),
    )
    conn.commit()


def buscar_refresh_token_ativo(
    conn: sqlite3.Connection,
    token_hash: str,
) -> dict | None:
    row = conn.execute(
        """SELECT * FROM refresh_tokens
           WHERE token_hash = ? AND revoked = 0 AND expires_at > ?""",
        (token_hash, _now_iso()),
    ).fetchone()
    return dict(row) if row else None


def revogar_refresh_token(conn: sqlite3.Connection, token_hash: str) -> None:
    conn.execute(
        "UPDATE refresh_tokens SET revoked = 1, revoked_at = ? WHERE token_hash = ?",
        (_now_iso(), token_hash),
    )
    conn.commit()


def revogar_sessao(conn: sqlite3.Connection, session_id: str, user_id: int) -> int:
    cursor = conn.execute(
        """UPDATE refresh_tokens
           SET revoked = 1, revoked_at = ?
           WHERE session_id = ? AND user_id = ? AND revoked = 0""",
        (_now_iso(), session_id, user_id),
    )
    conn.commit()
    return cursor.rowcount


def revogar_todas_sessoes(conn: sqlite3.Connection, user_id: int) -> int:
    cursor = conn.execute(
        """UPDATE refresh_tokens
           SET revoked = 1, revoked_at = ?
           WHERE user_id = ? AND revoked = 0""",
        (_now_iso(), user_id),
    )
    conn.commit()
    return cursor.rowcount


def registrar_evento_auth(
    conn: sqlite3.Connection,
    event: str,
    success: bool,
    user_id: int | None,
    email: str | None,
    ip: str | None,
    user_agent: str | None,
    reason: str | None = None,
) -> None:
    conn.execute(
        """INSERT INTO auth_events
           (event, success, user_id, email, ip, user_agent, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (event, int(success), user_id, email, ip, user_agent, reason, _now_iso()),
    )
    conn.commit()


def buscar_login_attempt(conn: sqlite3.Connection, email: str, ip: str | None) -> dict | None:
    row = conn.execute(
        "SELECT * FROM login_attempts WHERE email = ? AND ip = ?",
        (email, ip or ""),
    ).fetchone()
    return dict(row) if row else None


def registrar_falha_login(
    conn: sqlite3.Connection,
    email: str,
    ip: str | None,
    threshold: int,
    base_lockout_minutes: int,
    max_lockout_minutes: int,
) -> dict:
    current = buscar_login_attempt(conn, email, ip)
    now = _now_iso()

    if not current:
        conn.execute(
            """INSERT INTO login_attempts (email, ip, failed_count, last_failed_at, locked_until)
               VALUES (?, ?, 1, ?, NULL)""",
            (email, ip or "", now),
        )
        conn.commit()
        return {"failed_count": 1, "locked_until": None}

    failed_count = int(current["failed_count"]) + 1
    locked_until = current["locked_until"]

    if failed_count >= threshold:
        steps = failed_count - threshold + 1
        lock_minutes = min(base_lockout_minutes * steps, max_lockout_minutes)
        lock_until_dt = datetime.now(timezone.utc).timestamp() + (lock_minutes * 60)
        locked_until = datetime.fromtimestamp(lock_until_dt, timezone.utc).isoformat()

    conn.execute(
        """UPDATE login_attempts
           SET failed_count = ?, last_failed_at = ?, locked_until = ?
           WHERE email = ? AND ip = ?""",
        (failed_count, now, locked_until, email, ip or ""),
    )
    conn.commit()
    return {"failed_count": failed_count, "locked_until": locked_until}


def resetar_falhas_login(conn: sqlite3.Connection, email: str, ip: str | None) -> None:
    conn.execute(
        "DELETE FROM login_attempts WHERE email = ? AND ip = ?",
        (email, ip or ""),
    )
    conn.commit()


def login_bloqueado(conn: sqlite3.Connection, email: str, ip: str | None) -> tuple[bool, str | None]:
    current = buscar_login_attempt(conn, email, ip)
    if not current or not current.get("locked_until"):
        return False, None

    locked_until = current["locked_until"]
    if locked_until > _now_iso():
        return True, locked_until

    # lock expirou
    conn.execute(
        "UPDATE login_attempts SET locked_until = NULL WHERE email = ? AND ip = ?",
        (email, ip or ""),
    )
    conn.commit()
    return False, None


def buscar_login_attempt_email(conn: sqlite3.Connection, email: str) -> dict | None:
    row = conn.execute(
        "SELECT * FROM login_attempts_email WHERE email = ?",
        (email,),
    ).fetchone()
    return dict(row) if row else None


def registrar_falha_login_email(
    conn: sqlite3.Connection,
    email: str,
    threshold: int,
    base_lockout_minutes: int,
    max_lockout_minutes: int,
) -> dict:
    current = buscar_login_attempt_email(conn, email)
    now = _now_iso()

    if not current:
        conn.execute(
            """INSERT INTO login_attempts_email (email, failed_count, last_failed_at, locked_until)
               VALUES (?, 1, ?, NULL)""",
            (email, now),
        )
        conn.commit()
        return {"failed_count": 1, "locked_until": None}

    failed_count = int(current["failed_count"]) + 1
    locked_until = current["locked_until"]

    if failed_count >= threshold:
        steps = failed_count - threshold + 1
        lock_minutes = min(base_lockout_minutes * steps, max_lockout_minutes)
        lock_until_dt = datetime.now(timezone.utc).timestamp() + (lock_minutes * 60)
        locked_until = datetime.fromtimestamp(lock_until_dt, timezone.utc).isoformat()

    conn.execute(
        """UPDATE login_attempts_email
           SET failed_count = ?, last_failed_at = ?, locked_until = ?
           WHERE email = ?""",
        (failed_count, now, locked_until, email),
    )
    conn.commit()
    return {"failed_count": failed_count, "locked_until": locked_until}


def resetar_falhas_login_email(conn: sqlite3.Connection, email: str) -> None:
    conn.execute("DELETE FROM login_attempts_email WHERE email = ?", (email,))
    conn.commit()


def login_bloqueado_por_email(
    conn: sqlite3.Connection, email: str
) -> tuple[bool, str | None]:
    current = buscar_login_attempt_email(conn, email)
    if not current or not current.get("locked_until"):
        return False, None

    locked_until = current["locked_until"]
    if locked_until > _now_iso():
        return True, locked_until

    conn.execute(
        "UPDATE login_attempts_email SET locked_until = NULL WHERE email = ?",
        (email,),
    )
    conn.commit()
    return False, None


def invalidar_codigos_telefone_ativos(conn: sqlite3.Connection, phone_e164: str) -> None:
    conn.execute(
        """
        UPDATE phone_verification_codes
        SET invalidated_at = ?
        WHERE phone_e164 = ?
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
          AND expires_at > ?
        """,
        (_now_iso(), phone_e164, _now_iso()),
    )
    conn.commit()


def criar_codigo_telefone(
    conn: sqlite3.Connection,
    phone_e164: str,
    code_hash: str,
    expires_at: str,
) -> dict:
    cursor = conn.execute(
        """
        INSERT INTO phone_verification_codes (
            phone_e164,
            code_hash,
            expires_at,
            created_at
        )
        VALUES (?, ?, ?, ?)
        """,
        (phone_e164, code_hash, expires_at, _now_iso()),
    )
    conn.commit()
    return buscar_codigo_telefone_por_id(conn, cursor.lastrowid)


def buscar_codigo_telefone_ativo(conn: sqlite3.Connection, phone_e164: str) -> dict | None:
    row = conn.execute(
        """
        SELECT *
        FROM phone_verification_codes
        WHERE phone_e164 = ?
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
          AND expires_at > ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (phone_e164, _now_iso()),
    ).fetchone()
    return dict(row) if row else None


def buscar_codigo_telefone_por_id(conn: sqlite3.Connection, code_id: int) -> dict | None:
    row = conn.execute(
        "SELECT * FROM phone_verification_codes WHERE id = ?",
        (code_id,),
    ).fetchone()
    return dict(row) if row else None


def invalidar_codigo_telefone(conn: sqlite3.Connection, code_id: int) -> None:
    conn.execute(
        """
        UPDATE phone_verification_codes
        SET invalidated_at = COALESCE(invalidated_at, ?)
        WHERE id = ?
        """,
        (_now_iso(), code_id),
    )
    conn.commit()


def consumir_codigo_telefone(conn: sqlite3.Connection, code_id: int) -> None:
    conn.execute(
        """
        UPDATE phone_verification_codes
        SET consumed_at = ?
        WHERE id = ?
        """,
        (_now_iso(), code_id),
    )
    conn.commit()


def registrar_falha_codigo_telefone(
    conn: sqlite3.Connection,
    code_id: int,
    max_attempts: int,
) -> dict | None:
    current = buscar_codigo_telefone_por_id(conn, code_id)
    if not current:
        return None

    failed_attempts = int(current["failed_attempts"]) + 1
    invalidated_at = current["invalidated_at"]
    if failed_attempts >= max_attempts and invalidated_at is None:
        invalidated_at = _now_iso()

    conn.execute(
        """
        UPDATE phone_verification_codes
        SET failed_attempts = ?, last_failed_at = ?, invalidated_at = ?
        WHERE id = ?
        """,
        (failed_attempts, _now_iso(), invalidated_at, code_id),
    )
    conn.commit()
    return buscar_codigo_telefone_por_id(conn, code_id)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
