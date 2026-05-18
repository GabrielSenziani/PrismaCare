import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from app.database import get_db
from app.repositories import dose_repo
from app.schemas.dose_schema import DoseHojeResponse
from app.security import obter_usuario_logado

router = APIRouter()


@router.get(
    "/doses/hoje",
    response_model=list[DoseHojeResponse],
    summary="Doses do dia",
    description="Retorna todas as doses agendadas para hoje do usuário autenticado.",
)
def listar_doses_hoje(
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    tz = ZoneInfo(usuario.get("timezone") or "America/Sao_Paulo")
    hoje = datetime.now(tz).strftime("%Y-%m-%d")
    return dose_repo.listar_doses_hoje(
        conn,
        id_usuario=usuario["id"],
        hoje=hoje,
        timezone_name=usuario.get("timezone"),
    )
