import sqlite3

from app.core.datetime_utils import confirmation_datetime_iso_for_user


def listar_historico(
    conn: sqlite3.Connection,
    id_usuario: int,
    data_inicio: str,
    data_fim: str,
    timezone_name: str | None,
) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            c.id                    AS confirmacao_id,
            a.id                    AS agendamento_id,
            m.id                    AS medicamento_id,
            m.nome                  AS medicamento,
            m.dosagem               AS dosagem,
            c.data_hora_prevista    AS horario_previsto,
            c.data_hora_confirmacao AS horario_confirmacao,
            c.status                AS status
        FROM confirmacoes c
        JOIN agendamentos a ON a.id = c.id_agendamento
        JOIN medicamentos m ON m.id = a.id_medicamento
        WHERE m.id_usuario = ?
          AND date(c.data_hora_prevista) BETWEEN date(?) AND date(?)
        ORDER BY c.data_hora_prevista DESC
        """,
        (id_usuario, data_inicio, data_fim),
    ).fetchall()
    resultado = []
    for row in rows:
        item = dict(row)
        item["horario_confirmacao"] = confirmation_datetime_iso_for_user(
            item["horario_confirmacao"],
            timezone_name,
        )
        resultado.append(item)
    return resultado
