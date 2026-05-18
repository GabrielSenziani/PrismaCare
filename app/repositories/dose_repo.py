import sqlite3
from datetime import datetime

from app.core.datetime_utils import confirmation_datetime_iso_for_user
from app.repositories import agendamento_repo


def _gerar_confirmacoes_do_dia(conn: sqlite3.Connection, id_usuario: int, hoje: str) -> None:
    """Cria confirmações PENDENTE para agendamentos ativos de hoje que ainda não as têm."""
    agendamentos = agendamento_repo.listar_agendamentos_com_horarios(conn, id_usuario=id_usuario, hoje=hoje)
    weekday = int(datetime.strptime(hoje, "%Y-%m-%d").strftime("%w"))

    try:
        with conn:
            for agendamento in agendamentos:
                if not _recorrencia_valida_no_dia(agendamento, weekday):
                    continue

                for horario in agendamento["horarios"]:
                    data_hora_prevista = f"{hoje} {horario}:00"
                    existing = conn.execute(
                        """
                        SELECT 1
                        FROM confirmacoes
                        WHERE id_agendamento = ?
                          AND data_hora_prevista = ?
                        """,
                        (agendamento["id"], data_hora_prevista),
                    ).fetchone()
                    if existing:
                        continue

                    conn.execute(
                        """
                        INSERT INTO confirmacoes (id_agendamento, data_hora_prevista, status)
                        VALUES (?, ?, 'PENDENTE')
                        """,
                        (agendamento["id"], data_hora_prevista),
                    )
    except sqlite3.IntegrityError:
        conn.rollback()


def listar_doses_hoje(conn: sqlite3.Connection, id_usuario: int, hoje: str, timezone_name: str | None) -> list[dict]:
    _gerar_confirmacoes_do_dia(conn, id_usuario, hoje)
    rows = conn.execute(
        """
        SELECT
            c.id                        AS confirmacao_id,
            c.data_hora_prevista        AS horario_previsto,
            c.data_hora_confirmacao     AS horario_confirmacao,
            c.status                    AS status,
            m.nome                      AS med_nome,
            m.dosagem                   AS med_dosagem,
            m.observacao                AS med_observacao
        FROM confirmacoes c
        JOIN agendamentos a  ON c.id_agendamento = a.id
        JOIN medicamentos m  ON a.id_medicamento = m.id
        WHERE m.id_usuario = ?
          AND date(c.data_hora_prevista) = date(?)
        ORDER BY c.data_hora_prevista ASC
        """,
        (id_usuario, hoje),
    ).fetchall()

    resultado = []
    for row in rows:
        r = dict(row)
        resultado.append({
            "confirmacao_id": r["confirmacao_id"],
            "horario_previsto": r["horario_previsto"],
            "horario_confirmacao": confirmation_datetime_iso_for_user(
                r["horario_confirmacao"],
                timezone_name,
            ),
            "status": r["status"],
            "medicamento": {
                "nome": r["med_nome"],
                "dosagem": r["med_dosagem"],
                "observacao": r["med_observacao"],
            },
        })
    return resultado


def _recorrencia_valida_no_dia(agendamento: dict, weekday: int) -> bool:
    if agendamento["tipo_recorrencia"] == "diario":
        return True
    dias_semana = agendamento.get("dias_semana") or []
    return weekday in dias_semana
