import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from app.database import get_db
from app.repositories import agendamento_repo, medicamento_repo
from app.schemas.agendamento_schema import AgendamentoCreate, AgendamentoResponse, AgendamentoUpdate
from app.security import obter_usuario_logado

router = APIRouter()


@router.post("/agendamentos", response_model=AgendamentoResponse, status_code=201)
def create_agendamento(
    agendamento: AgendamentoCreate,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    medicamento = medicamento_repo.buscar_medicamento_por_id(conn, agendamento.id_medicamento)
    if not medicamento:
        raise HTTPException(status_code=404, detail="Medicamento não encontrado")
    if medicamento["id_usuario"] != usuario["id"]:
        raise HTTPException(status_code=403, detail="Acesso negado")

    data_inicio = str(agendamento.data_inicio) if agendamento.data_inicio else None
    data_fim = str(agendamento.data_fim) if agendamento.data_fim else None
    try:
        novo = agendamento_repo.criar_agendamento(
            conn,
            id_medicamento=agendamento.id_medicamento,
            tipo_recorrencia=agendamento.tipo_recorrencia,
            dias_semana=agendamento.dias_semana,
            horarios=agendamento.horarios,
            data_inicio=data_inicio,
            data_fim=data_fim,
            ativo=agendamento.ativo,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=422, detail="Referência inválida: medicamento não encontrado")
    return novo


@router.get("/agendamentos", response_model=list[AgendamentoResponse])
def listar_agendamentos(
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    return agendamento_repo.listar_agendamentos(conn, id_usuario=usuario["id"])


@router.get("/agendamentos/{agendamento_id}", response_model=AgendamentoResponse)
def buscar_agendamento(
    agendamento_id: int,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    agendamento = agendamento_repo.buscar_agendamento_por_id(conn, agendamento_id)
    if not agendamento:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    if not agendamento_repo.pertence_ao_usuario(conn, agendamento_id, usuario["id"]):
        raise HTTPException(status_code=403, detail="Acesso negado")
    return agendamento


@router.delete("/agendamentos/{agendamento_id}")
def deletar_agendamento(
    agendamento_id: int,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    existente = agendamento_repo.buscar_agendamento_por_id(conn, agendamento_id)
    if not existente:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    if not agendamento_repo.pertence_ao_usuario(conn, agendamento_id, usuario["id"]):
        raise HTTPException(status_code=403, detail="Acesso negado")

    try:
        agendamento_repo.deletar_agendamento(conn, agendamento_id)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Agendamento possui registros vinculados e não pode ser removido",
        )
    return {"message": "Agendamento deletado com sucesso"}


@router.patch("/agendamentos/{agendamento_id}", response_model=AgendamentoResponse)
def atualizar_agendamento(
    agendamento_id: int,
    dados: AgendamentoUpdate,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    existente = agendamento_repo.buscar_agendamento_por_id(conn, agendamento_id)
    if not existente:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    if not agendamento_repo.pertence_ao_usuario(conn, agendamento_id, usuario["id"]):
        raise HTTPException(status_code=403, detail="Acesso negado")

    if dados.id_medicamento is not None:
        medicamento = medicamento_repo.buscar_medicamento_por_id(conn, dados.id_medicamento)
        if not medicamento:
            raise HTTPException(status_code=404, detail="Medicamento não encontrado")
        if medicamento["id_usuario"] != usuario["id"]:
            raise HTTPException(status_code=403, detail="Acesso negado")

    payload = dados.model_dump(exclude_unset=True)
    if "data_inicio" in payload and payload["data_inicio"] is not None:
        payload["data_inicio"] = str(payload["data_inicio"])
    if "data_fim" in payload and payload["data_fim"] is not None:
        payload["data_fim"] = str(payload["data_fim"])

    return agendamento_repo.atualizar_agendamento(conn, agendamento_id, payload)
