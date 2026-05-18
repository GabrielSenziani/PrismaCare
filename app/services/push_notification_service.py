import logging
from datetime import datetime

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

EXPO_PUSH_TIMEOUT_SECONDS = 10


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def enviar_push_dose_atrasada(
    expo_push_token: str,
    medicamento: str,
    dosagem: str | None,
    horario_previsto: str,
    confirmacao_id: int,
    medicamento_id: int,
) -> dict:
    sent_at = _now_str()

    if not settings.expo_push_enabled:
        return {
            "status_envio": "FALHA",
            "data_hora_envio": sent_at,
            "expo_ticket_id": None,
            "erro": "Push remoto desabilitado neste ambiente",
            "invalid_token": False,
            "raw_response": None,
        }

    body = f"Você ainda não confirmou {medicamento}"
    if dosagem:
        body += f" {dosagem}"
    body += ". Confirme agora no PrismaCare."

    payload = [{
        "to": expo_push_token,
        "title": "Medicamento atrasado",
        "body": body,
        "data": {
            "kind": "dose-overdue",
            "confirmacaoId": confirmacao_id,
            "medicamentoId": medicamento_id,
            "horarioPrevisto": horario_previsto,
        },
    }]
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        response = requests.post(
            settings.expo_push_api_url,
            json=payload,
            headers=headers,
            timeout=EXPO_PUSH_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        logger.exception("Timeout ao enviar push remoto via Expo")
        return {
            "status_envio": "FALHA",
            "data_hora_envio": sent_at,
            "expo_ticket_id": None,
            "erro": "Timeout ao enviar push remoto via Expo",
            "invalid_token": False,
            "raw_response": None,
        }
    except requests.RequestException:
        logger.exception("Erro de rede ao enviar push remoto via Expo")
        return {
            "status_envio": "FALHA",
            "data_hora_envio": sent_at,
            "expo_ticket_id": None,
            "erro": "Erro de rede ao enviar push remoto via Expo",
            "invalid_token": False,
            "raw_response": None,
        }

    try:
        raw_response = response.json()
    except ValueError:
        raw_response = response.text

    if not (200 <= response.status_code < 300):
        logger.warning("Expo Push API retornou status inesperado: %s", response.status_code)
        return {
            "status_envio": "FALHA",
            "data_hora_envio": sent_at,
            "expo_ticket_id": None,
            "erro": f"Expo Push API retornou HTTP {response.status_code}",
            "invalid_token": False,
            "raw_response": raw_response,
        }

    ticket = None
    ticket_status = None
    ticket_error = None
    invalid_token = False
    if isinstance(raw_response, dict):
        data = raw_response.get("data")
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                ticket = first.get("id") if isinstance(first.get("id"), str) else None
                ticket_status = first.get("status") if isinstance(first.get("status"), str) else None
                ticket_error = first.get("message") if isinstance(first.get("message"), str) else None
                details = first.get("details")
                if isinstance(details, dict) and details.get("error") == "DeviceNotRegistered":
                    invalid_token = True
                    ticket_error = "Expo token inválido ou dispositivo não registrado"

    if ticket_status == "ok":
        return {
            "status_envio": "ENVIADO",
            "data_hora_envio": sent_at,
            "expo_ticket_id": ticket,
            "erro": None,
            "invalid_token": False,
            "raw_response": raw_response,
        }

    return {
        "status_envio": "FALHA",
        "data_hora_envio": sent_at,
        "expo_ticket_id": ticket,
        "erro": ticket_error or "Resposta inválida da Expo Push API",
        "invalid_token": invalid_token,
        "raw_response": raw_response,
    }
