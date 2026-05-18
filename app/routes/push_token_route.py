import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from app.database import get_db
from app.repositories import push_token_repo
from app.schemas.push_schema import (
    PushTokenRegisterRequest,
    PushTokenResponse,
    PushTokenUnregisterRequest,
)
from app.security import obter_usuario_logado

router = APIRouter(tags=["Push Tokens"])


@router.post("/push-tokens", response_model=PushTokenResponse)
def register_push_token(
    payload: PushTokenRegisterRequest,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    return push_token_repo.upsert_push_token(
        conn,
        user_id=usuario["id"],
        expo_push_token=payload.expo_push_token,
        platform=payload.platform,
        device_name=payload.device_name,
    )


@router.post("/push-tokens/unregister", response_model=PushTokenResponse)
def unregister_push_token(
    payload: PushTokenUnregisterRequest,
    usuario: dict = Depends(obter_usuario_logado),
    conn: sqlite3.Connection = Depends(get_db),
):
    token = push_token_repo.desativar_push_token(
        conn,
        user_id=usuario["id"],
        expo_push_token=payload.expo_push_token,
    )
    if not token:
        raise HTTPException(status_code=404, detail="Push token não encontrado")
    return token
