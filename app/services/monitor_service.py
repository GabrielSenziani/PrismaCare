from datetime import datetime, timedelta

from app.core.constants import StatusConfirmacao, StatusEnvio
from app.database import get_connection
from app.services.whatsapp_service import enviar_whatsapp

TOLERANCIA_MINUTOS = 5


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
                SELECT m.id_usuario
                FROM agendamentos a
                JOIN medicamentos m ON m.id = a.id_medicamento
                WHERE a.id = ?
                """,
                (agendamento_id,),
            ).fetchone()

            if not row:
                continue

            id_usuario = row["id_usuario"]

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
                    SELECT ct.telefone, m.nome AS nome_medicamento, m.dosagem,
                           c.data_hora_prevista
                    FROM contatos ct, agendamentos a, medicamentos m, confirmacoes c
                    WHERE ct.id = ? AND a.id = ?
                      AND m.id = a.id_medicamento
                      AND c.id = ?
                    """,
                    (contato_id, agendamento_id, confirmacao_id),
                ).fetchone()

                if dados:
                    horario = dados["data_hora_prevista"].split(" ")[1][:5]
                    mensagem = (
                        f"[PrismaCare] Atenção: o medicamento "
                        f"{dados['nome_medicamento']} ({dados['dosagem']}) "
                        f"previsto para {horario} não foi confirmado pelo usuário."
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

        conn.commit()

    finally:
        conn.close()

    return {
        "confirmacoes_atualizadas": confirmacoes_atualizadas,
        "notificacoes_criadas": notificacoes_criadas,
        "notificacoes_enviadas": notificacoes_enviadas,
    }
