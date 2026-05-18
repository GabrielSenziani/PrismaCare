import json
import sqlite3
from typing import Any


def criar_agendamento(
    conn: sqlite3.Connection,
    id_medicamento: int,
    tipo_recorrencia: str,
    dias_semana: list[int] | None,
    horarios: list[str],
    data_inicio: str | None,
    data_fim: str | None,
    ativo: bool,
) -> dict:
    with conn:
        cursor = conn.execute(
            """INSERT INTO agendamentos
               (id_medicamento, horario, frequencia, tipo_recorrencia, dias_semana_json, data_inicio, data_fim, ativo)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                id_medicamento,
                horarios[0],
                _legacy_frequencia(tipo_recorrencia),
                tipo_recorrencia,
                _serialize_dias_semana(dias_semana),
                data_inicio,
                data_fim,
                int(ativo),
            ),
        )
        agendamento_id = cursor.lastrowid
        _replace_horarios(conn, agendamento_id, horarios)
    return buscar_agendamento_por_id(conn, agendamento_id)


def listar_agendamentos(conn: sqlite3.Connection, id_usuario: int | None = None) -> list[dict]:
    if id_usuario is not None:
        rows = conn.execute(
            """SELECT a.* FROM agendamentos a
               JOIN medicamentos m ON a.id_medicamento = m.id
               WHERE m.id_usuario = ?
                 AND a.ativo = 1
               ORDER BY a.id ASC""",
            (id_usuario,),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM agendamentos WHERE ativo = 1 ORDER BY id ASC").fetchall()
    return [_converter(conn, row) for row in rows]


def buscar_agendamento_por_id(
    conn: sqlite3.Connection,
    agendamento_id: int,
    *,
    include_inactive: bool = False,
) -> dict | None:
    if include_inactive:
        row = conn.execute(
            "SELECT * FROM agendamentos WHERE id = ?",
            (agendamento_id,),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM agendamentos WHERE id = ? AND ativo = 1",
            (agendamento_id,),
        ).fetchone()
    return _converter(conn, row) if row else None


def deletar_agendamento(conn: sqlite3.Connection, agendamento_id: int) -> bool:
    with conn:
        conn.execute(
            """
            UPDATE confirmacoes
            SET status = 'CANCELADO'
            WHERE id_agendamento = ? AND status = 'PENDENTE'
            """,
            (agendamento_id,),
        )
        cursor = conn.execute(
            "UPDATE agendamentos SET ativo = 0 WHERE id = ? AND ativo = 1",
            (agendamento_id,),
        )
    return cursor.rowcount > 0


def pertence_ao_usuario(conn: sqlite3.Connection, agendamento_id: int, id_usuario: int) -> bool:
    row = conn.execute(
        """SELECT a.id FROM agendamentos a
           JOIN medicamentos m ON a.id_medicamento = m.id
           WHERE a.id = ? AND m.id_usuario = ?""",
        (agendamento_id, id_usuario),
    ).fetchone()
    return row is not None


def atualizar_agendamento(
    conn: sqlite3.Connection,
    agendamento_id: int,
    dados: dict[str, Any],
) -> dict | None:
    atual = buscar_agendamento_por_id(conn, agendamento_id, include_inactive=True)
    if not atual:
        return None

    tipo_recorrencia = dados.get("tipo_recorrencia", atual["tipo_recorrencia"])
    dias_semana = dados["dias_semana"] if "dias_semana" in dados else atual["dias_semana"]
    if tipo_recorrencia == "diario":
        dias_semana = None
    horarios = dados.get("horarios", atual["horarios"])
    data_inicio = dados.get("data_inicio", atual["data_inicio"])
    data_fim = dados["data_fim"] if "data_fim" in dados else atual.get("data_fim")
    ativo = dados.get("ativo", atual["ativo"])
    id_medicamento = dados.get("id_medicamento", atual["id_medicamento"])

    campos = {
        "id_medicamento": id_medicamento,
        "horario": horarios[0],
        "frequencia": _legacy_frequencia(tipo_recorrencia),
        "tipo_recorrencia": tipo_recorrencia,
        "dias_semana_json": _serialize_dias_semana(dias_semana),
        "data_inicio": data_inicio,
        "data_fim": data_fim,
        "ativo": int(ativo),
    }

    with conn:
        set_clause = ", ".join(f"{campo} = ?" for campo in campos)
        conn.execute(
            f"UPDATE agendamentos SET {set_clause} WHERE id = ?",
            (*campos.values(), agendamento_id),
        )
        if "horarios" in dados:
            _replace_horarios(conn, agendamento_id, horarios)
    return buscar_agendamento_por_id(conn, agendamento_id, include_inactive=True)


def listar_agendamentos_com_horarios(conn: sqlite3.Connection, id_usuario: int, hoje: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT a.*
        FROM agendamentos a
        JOIN medicamentos m ON a.id_medicamento = m.id
        WHERE m.id_usuario = ?
          AND a.ativo = 1
          AND date(?) >= date(a.data_inicio)
          AND (a.data_fim IS NULL OR date(?) <= date(a.data_fim))
        ORDER BY a.id ASC
        """,
        (id_usuario, hoje, hoje),
    ).fetchall()
    return [_converter(conn, row) for row in rows]


def _replace_horarios(conn: sqlite3.Connection, agendamento_id: int, horarios: list[str]) -> None:
    conn.execute("DELETE FROM agendamento_horarios WHERE id_agendamento = ?", (agendamento_id,))
    conn.executemany(
        """
        INSERT INTO agendamento_horarios (id_agendamento, horario)
        VALUES (?, ?)
        """,
        [(agendamento_id, horario) for horario in horarios],
    )


def _listar_horarios(conn: sqlite3.Connection, agendamento_id: int) -> list[str]:
    rows = conn.execute(
        """
        SELECT horario
        FROM agendamento_horarios
        WHERE id_agendamento = ?
        ORDER BY horario ASC
        """,
        (agendamento_id,),
    ).fetchall()
    return [row["horario"] for row in rows]


def _serialize_dias_semana(dias_semana: list[int] | None) -> str | None:
    if not dias_semana:
        return None
    return json.dumps(dias_semana)


def _legacy_frequencia(tipo_recorrencia: str) -> str:
    return "semanal" if tipo_recorrencia == "dias_semana" else "diario"


def _dias_semana_from_legacy(row: sqlite3.Row) -> list[int] | None:
    if row["tipo_recorrencia"] == "dias_semana":
        if row["dias_semana_json"]:
            try:
                dias = json.loads(row["dias_semana_json"])
                if isinstance(dias, list):
                    return [int(dia) for dia in dias]
            except (TypeError, ValueError):
                return None
        return None
    return None


def _converter(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    data = dict(row)
    data["ativo"] = bool(data["ativo"])
    data["dias_semana"] = _dias_semana_from_legacy(row)
    data["horarios"] = _listar_horarios(conn, row["id"])
    data["tipo_recorrencia"] = data.get("tipo_recorrencia") or _tipo_recorrencia_legacy(data.get("frequencia"))
    for campo_legado in ("horario", "frequencia", "dias_semana_json"):
        data.pop(campo_legado, None)
    return data


def _tipo_recorrencia_legacy(frequencia: str | None) -> str:
    if (frequencia or "").strip().lower() == "semanal":
        return "dias_semana"
    return "diario"
