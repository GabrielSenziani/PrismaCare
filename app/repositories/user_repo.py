import sqlite3


def criar_usuario(conn: sqlite3.Connection, nome: str | None, telefone: str | None,
                  email: str | None, senha: str | None, data_nascimento: str | None,
                  timezone: str = "America/Sao_Paulo",
                  auth_provider: str = "local",
                  google_sub: str | None = None,
                  avatar_url: str | None = None,
                  phone_e164: str | None = None,
                  phone_verified_at: str | None = None) -> dict:
    cursor = conn.execute(
        """INSERT INTO users (
               nome, telefone, phone_e164, phone_verified_at, email, senha, auth_provider, google_sub, avatar_url, data_nascimento, timezone
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            nome,
            telefone,
            phone_e164,
            phone_verified_at,
            email,
            senha,
            auth_provider,
            google_sub,
            avatar_url,
            data_nascimento,
            timezone,
        ),
    )
    conn.commit()
    return buscar_usuario_por_id(conn, cursor.lastrowid)


def atualizar_nome(conn: sqlite3.Connection, user_id: int, nome: str | None) -> dict | None:
    conn.execute(
        "UPDATE users SET nome = ? WHERE id = ?",
        (nome, user_id),
    )
    conn.commit()
    return buscar_usuario_por_id(conn, user_id)


def atualizar_timezone(conn: sqlite3.Connection, user_id: int, timezone: str) -> dict | None:
    conn.execute(
        "UPDATE users SET timezone = ?, timezone_confirmed = 1 WHERE id = ?",
        (timezone, user_id),
    )
    conn.commit()
    return buscar_usuario_por_id(conn, user_id)


def listar_usuarios(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM users").fetchall()
    return [dict(row) for row in rows]


def buscar_usuario_por_id(conn: sqlite3.Connection, user_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def buscar_usuario_por_email(conn: sqlite3.Connection, email: str) -> dict | None:
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return dict(row) if row else None


def buscar_usuario_por_phone_e164(conn: sqlite3.Connection, phone_e164: str) -> dict | None:
    row = conn.execute("SELECT * FROM users WHERE phone_e164 = ?", (phone_e164,)).fetchone()
    return dict(row) if row else None


def buscar_usuario_por_google_sub(conn: sqlite3.Connection, google_sub: str) -> dict | None:
    row = conn.execute("SELECT * FROM users WHERE google_sub = ?", (google_sub,)).fetchone()
    return dict(row) if row else None


def vincular_google_identity(
    conn: sqlite3.Connection,
    user_id: int,
    google_sub: str,
    avatar_url: str | None,
) -> dict | None:
    conn.execute(
        """
        UPDATE users
        SET google_sub = ?, avatar_url = ?
        WHERE id = ?
        """,
        (google_sub, avatar_url, user_id),
    )
    conn.commit()
    return buscar_usuario_por_id(conn, user_id)


def marcar_telefone_verificado(
    conn: sqlite3.Connection,
    user_id: int,
    telefone: str,
    phone_e164: str,
    verified_at: str,
) -> dict | None:
    conn.execute(
        """
        UPDATE users
        SET telefone = ?, phone_e164 = ?, phone_verified_at = ?
        WHERE id = ?
        """,
        (telefone, phone_e164, verified_at, user_id),
    )
    conn.commit()
    return buscar_usuario_por_id(conn, user_id)


def deletar_usuario(conn: sqlite3.Connection, user_id: int) -> bool:
    cursor = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    return cursor.rowcount > 0
