from datetime import datetime, timedelta

from app.core.constants import StatusConfirmacao, StatusEnvio
from app.core.config import settings
from app.database import get_connection
from app.repositories import push_token_repo
from app.services.push_notification_service import enviar_push_dose_atrasada
from app.services.whatsapp_service import enviar_whatsapp

TOLERANCIA_MINUTOS = settings.monitor_tolerance_minutes


def varrer_e_notificar() -> dict:
    """
    Executada pelo APScheduler a cada 5 minutos e disponível para
    disparo manual via POST /api/monitor/varredura.

    Retorna um resumo com o número de confirmações atualizadas e
    notificações criadas nesta execução.
    """
    conn = get_connection()
    confirmacoes_atualizadas = 0
    notificacoes_criadas = 0
    notificacoes_enviadas = 0
    push_notificacoes_enviadas = 0

    try:
        limite = (datetime.now() - timedelta(minutes=TOLERANCIA_MINUTOS)).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        pendentes = conn.execute(
            """
            SELECT c.id, c.id_agendamento, c.data_hora_prevista
            FROM confirmacoes c
            WHERE c.status = ?
              AND c.data_hora_prevista <= ?
            """,
            (StatusConfirmacao.PENDENTE, limite),
        ).fetchall()

        for confirmacao in pendentes:
            confirmacao_id = confirmacao["id"]
            agendamento_id = confirmacao["id_agendamento"]

            # Marca como NAO_CONFIRMADO
            conn.execute(
                "UPDATE confirmacoes SET status = ? WHERE id = ?",
                (StatusConfirmacao.NAO_CONFIRMADO, confirmacao_id),
            )
            confirmacoes_atualizadas += 1

            # Busca o id_usuario via medicamento → agendamento
            row = conn.execute(
                """
                SELECT
                    m.id_usuario,
                    m.id AS medicamento_id,
                    m.nome AS nome_medicamento,
                    m.dosagem,
                    u.nome AS nome_usuario
                FROM agendamentos a
                JOIN medicamentos m ON m.id = a.id_medicamento
                JOIN users u ON u.id = m.id_usuario
                WHERE a.id = ?
                """,
                (agendamento_id,),
            ).fetchone()

            if not row:
                continue

            id_usuario = row["id_usuario"]
            medicamento_id = row["medicamento_id"]
            nome_medicamento = row["nome_medicamento"]
            dosagem = row["dosagem"]
            nome_usuario = (row["nome_usuario"] or "").strip() or "O usuário"
            horario_previsto = confirmacao["data_hora_prevista"]

            # Busca contatos ativos do usuário
            contatos = conn.execute(
                "SELECT id FROM contatos WHERE id_usuario = ? AND ativo = 1",
                (id_usuario,),
            ).fetchall()

            for contato in contatos:
                contato_id = contato["id"]

                # Anti-duplicata: só cria se ainda não existe notificação
                # para esse par (confirmacao, contato)
                ja_existe = conn.execute(
                    """
                    SELECT 1 FROM notificacoes
                    WHERE id_confirmacao = ? AND id_contato = ?
                    """,
                    (confirmacao_id, contato_id),
                ).fetchone()

                if ja_existe:
                    continue

                conn.execute(
                    """
                    INSERT INTO notificacoes
                        (id_contato, id_confirmacao, data_hora_envio,
                         tipo_mensagem, status_envio)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        contato_id,
                        confirmacao_id,
                        None,
                        "WHATSAPP",
                        StatusEnvio.AGUARDANDO,
                    ),
                )
                notificacoes_criadas += 1

                dados = conn.execute(
                    """
                    SELECT ct.telefone, c.data_hora_prevista
                    FROM contatos ct, agendamentos a, medicamentos m, confirmacoes c
                    WHERE ct.id = ? AND a.id = ?
                      AND m.id = a.id_medicamento
                      AND c.id = ?
                    """,
                    (contato_id, agendamento_id, confirmacao_id),
                ).fetchone()

                if dados:
                    horario = dados["data_hora_prevista"].split(" ")[1][:5]
                    medicamento_label = nome_medicamento
                    if dosagem:
                        medicamento_label += f" ({dosagem})"
                    mensagem = (
                        f"[PrismaCare] Atenção: {nome_usuario} ainda não confirmou a dose de "
                        f"{medicamento_label} das {horario}.\n"
                        "Por favor, verifique se ele conseguiu tomar o medicamento."
                    )
                    resultado = enviar_whatsapp(dados["telefone"], mensagem)
                    conn.execute(
                        """
                        UPDATE notificacoes
                        SET status_envio = ?, data_hora_envio = ?
                        WHERE id_contato = ? AND id_confirmacao = ?
                        """,
                        (
                            resultado["status_envio"],
                            resultado["data_hora_envio"],
                            contato_id,
                            confirmacao_id,
                        ),
                    )
                    if resultado["status_envio"] == StatusEnvio.ENVIADO:
                        notificacoes_enviadas += 1

            if settings.expo_push_enabled:
                push_tokens = push_token_repo.listar_push_tokens_ativos(conn, id_usuario)
                for push_token in push_tokens:
                    ja_enviado = push_token_repo.buscar_push_attempt(
                        conn,
                        confirmacao_id=confirmacao_id,
                        push_token_id=push_token["id"],
                    )
                    if ja_enviado:
                        continue

                    push_result = enviar_push_dose_atrasada(
                        expo_push_token=push_token["expo_push_token"],
                        medicamento=nome_medicamento,
                        dosagem=dosagem,
                        horario_previsto=horario_previsto,
                        confirmacao_id=confirmacao_id,
                        medicamento_id=medicamento_id,
                    )
                    push_token_repo.registrar_push_attempt(
                        conn,
                        confirmacao_id=confirmacao_id,
                        push_token_id=push_token["id"],
                        status_envio=push_result["status_envio"],
                        expo_ticket_id=push_result["expo_ticket_id"],
                        erro=push_result["erro"],
                    )
                    if push_result["invalid_token"]:
                        push_token_repo.marcar_push_token_inativo_por_id(
                            conn,
                            push_token_id=push_token["id"],
                            ultimo_erro=push_result["erro"],
                        )
                    if push_result["status_envio"] == StatusEnvio.ENVIADO:
                        push_notificacoes_enviadas += 1

        conn.commit()

    finally:
        conn.close()

    return {
        "confirmacoes_atualizadas": confirmacoes_atualizadas,
        "notificacoes_criadas": notificacoes_criadas,
        "notificacoes_enviadas": notificacoes_enviadas,
        "push_notificacoes_enviadas": push_notificacoes_enviadas,
    }
