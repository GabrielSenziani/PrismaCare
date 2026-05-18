import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from app.core.phone_auth import normalize_existing_brazil_phone
from app.database import get_db
from app.repositories import user_repo
from app.schemas.user_schema import UserCreate, UserProfileUpdate, UserResponse, TimezoneUpdate
from app.security import hash_senha, obter_usuario_logado, validar_forca_senha

router = APIRouter()


@router.post("/users", response_model=UserResponse, status_code=201)
def create_user(user: UserCreate, conn: sqlite3.Connection = Depends(get_db)):
    validar_forca_senha(user.senha)
    existente = user_repo.buscar_usuario_por_email(conn, user.email)
    if existente:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")

    phone_e164 = None
    telefone = user.telefone
    if user.telefone:
        normalized_phone = normalize_existing_brazil_phone(user.telefone)
        if not normalized_phone:
            raise HTTPException(status_code=422, detail="Telefone inválido")
        phone_e164, telefone = normalized_phone
        if user_repo.buscar_usuario_por_phone_e164(conn, phone_e164):
            raise HTTPException(status_code=400, detail="Telefone já cadastrado")

    data_nasc = str(user.data_nascimento) if user.data_nascimento else None
    novo_user = user_repo.criar_usuario(
        conn,
        nome=user.nome,
        telefone=telefone,
        email=user.email,
        senha=hash_senha(user.senha),
        data_nascimento=data_nasc,
        phone_e164=phone_e164,
    )
    return novo_user


@router.get("/users/me", response_model=UserResponse)
def meu_perfil(usuario: dict = Depends(obter_usuario_logado)):
    return usuario


@router.patch("/users/me", response_model=UserResponse)
def atualizar_meu_perfil(
    payload: UserProfileUpdate,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    return user_repo.atualizar_nome(conn, usuario["id"], payload.name)


@router.get("/users", response_model=list[UserResponse])
def listar_users(
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    user = user_repo.buscar_usuario_por_id(conn, usuario["id"])
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return [user]


@router.get("/users/{user_id}", response_model=UserResponse)
def buscar_user(
    user_id: int,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    if user_id != usuario["id"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    user = user_repo.buscar_usuario_por_id(conn, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return user


@router.patch("/users/me/timezone")
def atualizar_timezone_usuario(
    payload: TimezoneUpdate,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    atualizado = user_repo.atualizar_timezone(conn, usuario["id"], payload.timezone)
    return {
        "timezone": atualizado["timezone"],
        "timezone_confirmed": bool(atualizado["timezone_confirmed"]),
    }


@router.delete("/users/{user_id}")
def deletar_user(
    user_id: int,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    if user_id != usuario["id"]:
        raise HTTPException(status_code=403, detail="Você só pode deletar sua própria conta")

    try:
        user_repo.deletar_usuario(conn, user_id)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Usuário possui registros vinculados e não pode ser removido",
        )
    return {"message": "Usuário deletado com sucesso"}
