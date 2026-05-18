import logging
import re
from datetime import datetime

import requests

from app.core.config import settings
from app.core.constants import StatusEnvio

logger = logging.getLogger(__name__)

EVOLUTION_TIMEOUT_SECONDS = 10


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def normalizar_telefone_whatsapp(telefone: str) -> str | None:
    digits = re.sub(r"\D", "", telefone or "")
    if not digits:
        return None
    if digits.startswith("55") and len(digits) in {12, 13}:
        return digits
    if len(digits) in {10, 11}:
        return f"55{digits}"
    return None


def whatsapp_status() -> dict:
    provider = settings.whatsapp_provider
    if provider == "simulation":
        configured = True
    else:
        configured = all(
            [
                settings.evolution_api_url,
                settings.evolution_api_key,
                settings.evolution_instance_name,
            ]
        )
    return {
        "provider": provider,
        "configured": configured,
        "api_url": settings.evolution_api_url,
        "instance_name": settings.evolution_instance_name,
        "test_endpoint_enabled": settings.enable_whatsapp_test_endpoint,
    }


def enviar_whatsapp(telefone: str, mensagem: str) -> dict:
    provider = settings.whatsapp_provider
    if provider == "evolution":
        return _enviar_whatsapp_evolution(telefone, mensagem)
    return _enviar_whatsapp_simulado(telefone, mensagem)


def _enviar_whatsapp_simulado(telefone: str, mensagem: str) -> dict:
    logger.info("[WHATSAPP SIMULADO] Para %s: %s", telefone, mensagem)
    return {
        "provider": "simulation",
        "status_envio": StatusEnvio.ENVIADO,
        "data_hora_envio": _now_str(),
        "raw_response": None,
    }


def _enviar_whatsapp_evolution(telefone: str, mensagem: str) -> dict:
    sent_at = _now_str()
    normalized_phone = normalizar_telefone_whatsapp(telefone)
    if not normalized_phone:
        return {
            "provider": "evolution",
            "status_envio": StatusEnvio.FALHA,
            "data_hora_envio": sent_at,
            "raw_response": None,
            "error": "Telefone inválido para envio WhatsApp",
        }

    status = whatsapp_status()
    if not status["configured"]:
        return {
            "provider": "evolution",
            "status_envio": StatusEnvio.FALHA,
            "data_hora_envio": sent_at,
            "raw_response": None,
            "error": "Provider Evolution API não está configurado completamente",
        }

    url = f"{settings.evolution_api_url.rstrip('/')}/message/sendText/{settings.evolution_instance_name}"
    payload = {
        "number": normalized_phone,
        "text": mensagem,
    }
    headers = {
        "Content-Type": "application/json",
        "apikey": settings.evolution_api_key or "",
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=EVOLUTION_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        logger.exception("Timeout ao enviar WhatsApp via Evolution API")
        return {
            "provider": "evolution",
            "status_envio": StatusEnvio.FALHA,
            "data_hora_envio": sent_at,
            "raw_response": None,
            "error": "Timeout ao enviar mensagem via Evolution API",
        }
    except requests.RequestException:
        logger.exception("Erro de rede ao enviar WhatsApp via Evolution API")
        return {
            "provider": "evolution",
            "status_envio": StatusEnvio.FALHA,
            "data_hora_envio": sent_at,
            "raw_response": None,
            "error": "Erro de rede ao enviar mensagem via Evolution API",
        }

    try:
        raw_response = response.json()
    except ValueError:
        raw_response = response.text

    if 200 <= response.status_code < 300:
        return {
            "provider": "evolution",
            "status_envio": StatusEnvio.ENVIADO,
            "data_hora_envio": sent_at,
            "raw_response": raw_response,
        }

    logger.warning("Evolution API retornou status inesperado: %s", response.status_code)
    return {
        "provider": "evolution",
        "status_envio": StatusEnvio.FALHA,
        "data_hora_envio": sent_at,
        "raw_response": raw_response,
        "error": f"Evolution API retornou HTTP {response.status_code}",
    }
