import sqlite3
import os
import json
from datetime import datetime

from app.core.phone_auth import normalize_existing_brazil_phone

_REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
_DEFAULT_DB_PATH = os.path.join(_REPO_ROOT, "data", "prismacare.db")

DATABASE_PATH = os.getenv("DATABASE_PATH", _DEFAULT_DB_PATH)
os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)

# Padrão de datas: o backend usa o timezone IANA de cada usuário para calcular
# datas e horários locais. Timestamps são armazenados como strings no formato
# YYYY-MM-DD HH:MM:SS no horário local do usuário, sem offset.


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


_STATUS_PRIORITY = {
    "CONFIRMADO": 4,
    "NAO_CONFIRMADO": 3,
    "PENDENTE": 2,
    "CANCELADO": 1,
}


def _escolher_confirmacao_canonica(confirmacoes: list[sqlite3.Row]) -> sqlite3.Row:
    return max(
        confirmacoes,
        key=lambda row: (
            _STATUS_PRIORITY.get(row["status"], 0),
            1 if row["data_hora_confirmacao"] else 0,
            row["data_hora_confirmacao"] or "",
            -row["id"],
        ),
    )


def _mesclar_confirmacoes_duplicadas(conn: sqlite3.Connection) -> None:
    duplicados = conn.execute(
        """
        SELECT id_agendamento, data_hora_prevista
        FROM confirmacoes
        WHERE data_hora_prevista IS NOT NULL
        GROUP BY id_agendamento, data_hora_prevista
        HAVING COUNT(*) > 1
        """
    ).fetchall()

    for duplicado in duplicados:
        confirmacoes = conn.execute(
            """
            SELECT id, status, data_hora_confirmacao
            FROM confirmacoes
            WHERE id_agendamento = ? AND data_hora_prevista = ?
            ORDER BY id ASC
            """,
            (duplicado["id_agendamento"], duplicado["data_hora_prevista"]),
        ).fetchall()
        if len(confirmacoes) < 2:
            continue

        canonica = _escolher_confirmacao_canonica(confirmacoes)
        duplicadas = [row for row in confirmacoes if row["id"] != canonica["id"]]

        for row in duplicadas:
            conn.execute(
                """
                INSERT OR IGNORE INTO notificacoes (
                    id_contato,
                    id_confirmacao,
                    data_hora_envio,
                    tipo_mensagem,
                    status_envio
                )
                SELECT
                    id_contato,
                    ?,
                    data_hora_envio,
                    tipo_mensagem,
                    status_envio
                FROM notificacoes
                WHERE id_confirmacao = ?
                """,
                (canonica["id"], row["id"]),
            )
            conn.execute(
                "DELETE FROM notificacoes WHERE id_confirmacao = ?",
                (row["id"],),
            )

        conn.execute(
            """
            UPDATE confirmacoes
            SET status = ?, data_hora_confirmacao = ?
            WHERE id = ?
            """,
            (
                canonica["status"],
                canonica["data_hora_confirmacao"],
                canonica["id"],
            ),
        )

        conn.executemany(
            "DELETE FROM confirmacoes WHERE id = ?",
            [(row["id"],) for row in duplicadas],
        )


def init_db():
    conn = get_connection()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT,
                telefone TEXT,
                phone_e164 TEXT,
                phone_verified_at TEXT,
                email TEXT UNIQUE,
                senha TEXT,
                auth_provider TEXT NOT NULL DEFAULT 'local',
                google_sub TEXT,
                avatar_url TEXT,
                data_nascimento TEXT,
                timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
                timezone_confirmed INTEGER NOT NULL DEFAULT 0,
                CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
            );

            CREATE TABLE IF NOT EXISTS medicamentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_usuario INTEGER NOT NULL,
                nome TEXT NOT NULL,
                dosagem TEXT NOT NULL,
                observacao TEXT,
                ativo INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (id_usuario) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS contatos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_usuario INTEGER NOT NULL,
                nome TEXT NOT NULL,
                telefone TEXT NOT NULL,
                parentesco TEXT NOT NULL,
                ativo INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (id_usuario) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS agendamentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_medicamento INTEGER NOT NULL,
                horario TEXT NOT NULL,
                frequencia TEXT NOT NULL,
                tipo_recorrencia TEXT,
                dias_semana_json TEXT,
                data_inicio TEXT,
                data_fim TEXT,
                ativo INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (id_medicamento) REFERENCES medicamentos(id)
            );

            CREATE TABLE IF NOT EXISTS agendamento_horarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_agendamento INTEGER NOT NULL,
                horario TEXT NOT NULL,
                FOREIGN KEY (id_agendamento) REFERENCES agendamentos(id)
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamento_horarios_unique
            ON agendamento_horarios (id_agendamento, horario);

            CREATE TABLE IF NOT EXISTS confirmacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_agendamento INTEGER NOT NULL,
                data_hora_prevista TEXT,
                data_hora_confirmacao TEXT,
                status TEXT NOT NULL CHECK(status IN ('PENDENTE','CONFIRMADO','NAO_CONFIRMADO','CANCELADO')),
                FOREIGN KEY (id_agendamento) REFERENCES agendamentos(id)
            );

            CREATE TABLE IF NOT EXISTS notificacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_contato INTEGER NOT NULL,
                id_confirmacao INTEGER NOT NULL,
                data_hora_envio TEXT,
                tipo_mensagem TEXT NOT NULL,
                status_envio TEXT NOT NULL CHECK(status_envio IN ('AGUARDANDO','ENVIADO','FALHA')),
                FOREIGN KEY (id_contato) REFERENCES contatos(id),
                FOREIGN KEY (id_confirmacao) REFERENCES confirmacoes(id)
            );

            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_id TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                revoked INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                revoked_at TEXT,
                ip TEXT,
                user_agent TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
            ON refresh_tokens (user_id);

            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session_id
            ON refresh_tokens (session_id);

            CREATE TABLE IF NOT EXISTS auth_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event TEXT NOT NULL,
                success INTEGER NOT NULL,
                user_id INTEGER,
                email TEXT,
                ip TEXT,
                user_agent TEXT,
                reason TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_auth_events_created_at
            ON auth_events (created_at);

            CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                ip TEXT NOT NULL DEFAULT '',
                failed_count INTEGER NOT NULL DEFAULT 0,
                last_failed_at TEXT,
                locked_until TEXT
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_login_attempts_email_ip
            ON login_attempts (email, ip);

            CREATE TABLE IF NOT EXISTS login_attempts_email (
                email TEXT PRIMARY KEY,
                failed_count INTEGER NOT NULL DEFAULT 0,
                last_failed_at TEXT,
                locked_until TEXT
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_notificacoes_confirmacao_contato
            ON notificacoes (id_confirmacao, id_contato);

            CREATE INDEX IF NOT EXISTS idx_medicamentos_id_usuario
            ON medicamentos (id_usuario);

            CREATE INDEX IF NOT EXISTS idx_confirmacoes_data_hora_prevista
            ON confirmacoes (data_hora_prevista);

            CREATE TABLE IF NOT EXISTS phone_verification_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone_e164 TEXT NOT NULL,
                code_hash TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                consumed_at TEXT,
                invalidated_at TEXT,
                failed_attempts INTEGER NOT NULL DEFAULT 0,
                last_failed_at TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_phone_codes_phone_created
            ON phone_verification_codes (phone_e164, created_at DESC);

            CREATE TABLE IF NOT EXISTS push_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_usuario INTEGER NOT NULL,
                expo_push_token TEXT NOT NULL UNIQUE,
                platform TEXT NOT NULL,
                device_name TEXT,
                ativo INTEGER NOT NULL DEFAULT 1,
                ultimo_erro TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (id_usuario) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_push_tokens_usuario_ativo
            ON push_tokens (id_usuario, ativo);

            CREATE TABLE IF NOT EXISTS dose_overdue_push_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_confirmacao INTEGER NOT NULL,
                id_push_token INTEGER NOT NULL,
                status_envio TEXT NOT NULL CHECK(status_envio IN ('ENVIADO','FALHA')),
                expo_ticket_id TEXT,
                erro TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (id_confirmacao) REFERENCES confirmacoes(id),
                FOREIGN KEY (id_push_token) REFERENCES push_tokens(id)
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_dose_overdue_push_attempts_confirmacao_token
            ON dose_overdue_push_attempts (id_confirmacao, id_push_token);
        """)
        conn.commit()

        
        conn.executescript("""
            UPDATE confirmacoes SET status = 'PENDENTE'       WHERE status = 'pendente';
            UPDATE confirmacoes SET status = 'CONFIRMADO'     WHERE status = 'confirmado';
            UPDATE confirmacoes SET status = 'NAO_CONFIRMADO' WHERE status = 'atrasado_notificado';
            UPDATE confirmacoes SET status = 'NAO_CONFIRMADO' WHERE status = 'ATRASADO';
            UPDATE confirmacoes SET status = 'CANCELADO'      WHERE status = 'nao_confirmado';
            UPDATE confirmacoes SET status = 'CANCELADO'      WHERE status = 'cancelado';
            UPDATE notificacoes SET status_envio = 'AGUARDANDO' WHERE status_envio = 'pendente';
            UPDATE notificacoes SET status_envio = 'ENVIADO'    WHERE status_envio = 'enviado';
            UPDATE notificacoes SET status_envio = 'FALHA'      WHERE status_envio = 'falhou';
        """)
        conn.commit()

        _mesclar_confirmacoes_duplicadas(conn)
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_confirmacoes_agendamento_horario
            ON confirmacoes (id_agendamento, data_hora_prevista)
            """
        )
        conn.commit()

        for sql in [
            "ALTER TABLE agendamentos ADD COLUMN tipo_recorrencia TEXT",
            "ALTER TABLE agendamentos ADD COLUMN dias_semana_json TEXT",
        ]:
            try:
                conn.execute(sql)
                conn.commit()
            except sqlite3.OperationalError as exc:
                if "duplicate column name" not in str(exc).lower():
                    raise

        agendamentos = conn.execute(
            """
            SELECT id, horario, frequencia, data_inicio, tipo_recorrencia, dias_semana_json
            FROM agendamentos
            """
        ).fetchall()

        for agendamento in agendamentos:
            tipo_recorrencia = agendamento["tipo_recorrencia"]
            dias_semana_json = agendamento["dias_semana_json"]
            frequencia = (agendamento["frequencia"] or "").strip().lower()
            horario = agendamento["horario"]
            data_inicio = agendamento["data_inicio"]

            if not tipo_recorrencia:
                if frequencia == "semanal":
                    tipo_recorrencia = "dias_semana"
                    dia_semana = None
                    if data_inicio:
                        try:
                            dia_semana = int(datetime.strptime(data_inicio, "%Y-%m-%d").strftime("%w"))
                        except ValueError:
                            dia_semana = None
                    dias_semana_json = json.dumps([dia_semana]) if dia_semana is not None else None
                else:
                    tipo_recorrencia = "diario"
                    dias_semana_json = None

                conn.execute(
                    """
                    UPDATE agendamentos
                    SET tipo_recorrencia = ?, dias_semana_json = ?
                    WHERE id = ?
                    """,
                    (tipo_recorrencia, dias_semana_json, agendamento["id"]),
                )

            existing_horarios = conn.execute(
                "SELECT 1 FROM agendamento_horarios WHERE id_agendamento = ? LIMIT 1",
                (agendamento["id"],),
            ).fetchone()
            if not existing_horarios and horario:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO agendamento_horarios (id_agendamento, horario)
                    VALUES (?, ?)
                    """,
                    (agendamento["id"], horario),
                )
        conn.commit()

        for sql in [
            "ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo'",
            "ALTER TABLE users ADD COLUMN timezone_confirmed INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'",
            "ALTER TABLE users ADD COLUMN google_sub TEXT",
            "ALTER TABLE users ADD COLUMN avatar_url TEXT",
            "ALTER TABLE users ADD COLUMN phone_e164 TEXT",
            "ALTER TABLE users ADD COLUMN phone_verified_at TEXT",
        ]:
            try:
                conn.execute(sql)
                conn.commit()
            except sqlite3.OperationalError as exc:
                if "duplicate column name" not in str(exc).lower():
                    raise

        user_columns = conn.execute("PRAGMA table_info(users)").fetchall()
        user_column_map = {column["name"]: column for column in user_columns}
        must_rebuild_users = any(
            column["name"] in {"nome", "telefone"} and column["notnull"] == 1
            for column in user_columns
        )
        must_rebuild_users = must_rebuild_users or "phone_e164" not in user_column_map or "phone_verified_at" not in user_column_map
        must_rebuild_users = must_rebuild_users or user_column_map["email"]["notnull"] == 1 or user_column_map["senha"]["notnull"] == 1
        if must_rebuild_users:
            conn.execute("PRAGMA foreign_keys = OFF")
            conn.executescript("""
                CREATE TABLE users_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT,
                    telefone TEXT,
                    phone_e164 TEXT,
                    phone_verified_at TEXT,
                    email TEXT UNIQUE,
                    senha TEXT,
                    auth_provider TEXT NOT NULL DEFAULT 'local',
                    google_sub TEXT,
                    avatar_url TEXT,
                    data_nascimento TEXT,
                    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
                    timezone_confirmed INTEGER NOT NULL DEFAULT 0,
                    CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
                );

                INSERT INTO users_new (
                    id, nome, telefone, phone_e164, phone_verified_at, email, senha, auth_provider, google_sub, avatar_url,
                    data_nascimento, timezone, timezone_confirmed
                )
                SELECT
                    id,
                    NULLIF(nome, ''),
                    NULLIF(telefone, ''),
                    phone_e164,
                    phone_verified_at,
                    NULLIF(email, ''),
                    senha,
                    COALESCE(auth_provider, 'local'),
                    google_sub,
                    avatar_url,
                    data_nascimento,
                    COALESCE(timezone, 'America/Sao_Paulo'),
                    COALESCE(timezone_confirmed, 0)
                FROM users;

                DROP TABLE users;
                ALTER TABLE users_new RENAME TO users;
            """)
            conn.commit()
            conn.execute("PRAGMA foreign_keys = ON")

        existing_phone_rows = conn.execute(
            "SELECT id, telefone, phone_e164 FROM users WHERE telefone IS NOT NULL AND TRIM(telefone) <> ''"
        ).fetchall()
        seen_phone_e164: set[str] = set(
            row["phone_e164"]
            for row in conn.execute("SELECT phone_e164 FROM users WHERE phone_e164 IS NOT NULL").fetchall()
        )
        for row in existing_phone_rows:
            if row["phone_e164"]:
                continue
            normalized = normalize_existing_brazil_phone(row["telefone"])
            if not normalized:
                continue
            phone_e164, formatted_phone = normalized
            if phone_e164 in seen_phone_e164:
                continue
            conn.execute(
                "UPDATE users SET telefone = ?, phone_e164 = ? WHERE id = ?",
                (formatted_phone, phone_e164, row["id"]),
            )
            seen_phone_e164.add(phone_e164)
        conn.commit()

        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub_unique
            ON users(google_sub)
            WHERE google_sub IS NOT NULL
            """
        )
        conn.commit()
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_e164_unique
            ON users(phone_e164)
            WHERE phone_e164 IS NOT NULL
            """
        )
        conn.commit()
    finally:
        conn.close()
