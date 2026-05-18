import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.security import obter_usuario_logado

logger = logging.getLogger("client_logs")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[client] %(message)s"))
    logger.addHandler(handler)
    logger.propagate = False

router = APIRouter(tags=["Client Logs"])


class ClientLogPayload(BaseModel):
    event: str
    level: Optional[str] = "info"
    data: Optional[Dict[str, Any]] = None


@router.post("/client-logs")
def receber_client_log(
    payload: ClientLogPayload,
    usuario: dict = Depends(obter_usuario_logado),
):
    level = (payload.level or "info").lower()
    message = f"user_id={usuario['id']} event={payload.event} data={payload.data}"
    if level == "error" or level == "warn":
        logger.warning(message)
    else:
        logger.info(message)
    return {"ok": True}
