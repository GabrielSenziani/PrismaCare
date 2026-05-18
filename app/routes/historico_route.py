import sqlite3
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, HTTPException

from app.database import get_db
from app.repositories import historico_repo
from app.schemas.historico_schema import HistoricoItemResponse
from app.security import obter_usuario_logado

router = APIRouter()


@router.get(
    "/doses/historico",
    response_model=list[HistoricoItemResponse],
    summary="Histórico de doses",
    description="Retorna o histórico de doses do usuário autenticado em um intervalo de datas.",
)
def listar_historico(
    data_inicio: date | None = Query(default=None, description="Data inicial (YYYY-MM-DD)"),
    data_fim: date | None = Query(default=None, description="Data final (YYYY-MM-DD)"),
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    tz = ZoneInfo(usuario.get("timezone") or "America/Sao_Paulo")

    if data_fim is None:
        data_fim = datetime.now(tz).date()
    if data_inicio is None:
        data_inicio = data_fim - timedelta(days=30)

    if data_inicio > data_fim:
        raise HTTPException(
            status_code=400,
            detail="data_inicio não pode ser maior que data_fim",
        )

    return historico_repo.listar_historico(
        conn,
        id_usuario=usuario["id"],
        data_inicio=str(data_inicio),
        data_fim=str(data_fim),
        timezone_name=usuario.get("timezone"),
    )
