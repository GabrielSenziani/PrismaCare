import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from app.core.constants import StatusConfirmacao
from app.core.datetime_utils import confirmation_datetime_iso_for_user, utc_now_iso
from app.database import get_db
from app.repositories import confirmacao_repo, agendamento_repo
from app.schemas.confirmacao_schema import ConfirmacaoCreate, ConfirmacaoResponse
from app.security import obter_usuario_logado

router = APIRouter()


def _serializar_confirmacao_para_usuario(confirmacao: dict, timezone_name: str | None) -> dict:
    return {
        **confirmacao,
        "data_hora_confirmacao": confirmation_datetime_iso_for_user(
            confirmacao.get("data_hora_confirmacao"),
            timezone_name,
        ),
    }


@router.post("/confirmacoes", response_model=ConfirmacaoResponse, status_code=201)
def create_confirmacao(
    confirmacao: ConfirmacaoCreate,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    if not agendamento_repo.pertence_ao_usuario(conn, confirmacao.id_agendamento, usuario["id"]):
        raise HTTPException(status_code=403, detail="Acesso negado")

    try:
        nova = confirmacao_repo.criar_confirmacao(
            conn,
            id_agendamento=confirmacao.id_agendamento,
            data_hora_prevista=confirmacao.data_hora_prevista,
            data_hora_confirmacao=None,
            status=confirmacao.status,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=422, detail="Referência inválida: agendamento não encontrado")
    return nova


@router.get("/confirmacoes", response_model=list[ConfirmacaoResponse])
def listar_confirmacoes(
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    confirmacoes = confirmacao_repo.listar_confirmacoes(conn, id_usuario=usuario["id"])
    return [_serializar_confirmacao_para_usuario(item, usuario.get("timezone")) for item in confirmacoes]


@router.get("/confirmacoes/{confirmacao_id}", response_model=ConfirmacaoResponse)
def buscar_confirmacao(
    confirmacao_id: int,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    confirmacao = confirmacao_repo.buscar_confirmacao_por_id(conn, confirmacao_id)
    if not confirmacao:
        raise HTTPException(status_code=404, detail="Confirmação não encontrada")
    if not confirmacao_repo.pertence_ao_usuario(conn, confirmacao_id, usuario["id"]):
        raise HTTPException(status_code=403, detail="Acesso negado")
    return _serializar_confirmacao_para_usuario(confirmacao, usuario.get("timezone"))


@router.put("/confirmacoes/{confirmacao_id}/confirmar", response_model=ConfirmacaoResponse)
def confirmar_uso(
    confirmacao_id: int,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    existente = confirmacao_repo.buscar_confirmacao_por_id(conn, confirmacao_id)
    if not existente:
        raise HTTPException(status_code=404, detail="Confirmação não encontrada")
    if not confirmacao_repo.pertence_ao_usuario(conn, confirmacao_id, usuario["id"]):
        raise HTTPException(status_code=403, detail="Acesso negado")

    atualizada = confirmacao_repo.atualizar_confirmacao(
        conn,
        confirmacao_id=confirmacao_id,
        status=StatusConfirmacao.CONFIRMADO,
        data_hora_confirmacao=utc_now_iso(),
    )
    return _serializar_confirmacao_para_usuario(atualizada, usuario.get("timezone"))
