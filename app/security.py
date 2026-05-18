import hashlib
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.audit import audit_event
from app.core.config import settings
from app.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


SENHA_FRACA_DETALHE = "A senha deve ter pelo menos 8 caracteres, incluindo letra e número."


def validar_forca_senha(senha: str) -> None:
    if (
        not isinstance(senha, str)
        or len(senha) < 8
        or not any(c.isalpha() for c in senha)
        or not any(c.isdigit() for c in senha)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=SENHA_FRACA_DETALHE,
        )


def hash_senha(senha: str) -> str:
    senha_bytes = senha.encode("utf-8")
    hashed = bcrypt.hashpw(senha_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verificar_senha(senha: str, senha_hash: str) -> bool:
    return bcrypt.checkpw(
        senha.encode("utf-8"),
        senha_hash.encode("utf-8"),
    )


def gerar_par_tokens(user_id: int, email: str | None, session_id: str | None = None) -> tuple[str, str, str]:
    session = session_id or str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    access_payload = {
        "sub": str(user_id),
        "email": email,
        "sid": session,
        "typ": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_ttl_min),
    }
    refresh_payload = {
        "sub": str(user_id),
        "email": email,
        "sid": session,
        "typ": "refresh",
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(days=settings.refresh_ttl_days),
    }

    access_token = jwt.encode(access_payload, settings.jwt_secret, algorithm=settings.jwt_alg)
    refresh_token = jwt.encode(refresh_payload, settings.jwt_secret, algorithm=settings.jwt_alg)
    return access_token, refresh_token, session


def gerar_phone_verification_token(phone_e164: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "phone_e164": phone_e164,
        "typ": "phone_verification",
        "iat": now,
        "exp": now + timedelta(minutes=10),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def extrair_payload(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])
    except (jwt.PyJWTError, ValueError, TypeError):
        audit_event("token_invalid", token_type=expected_type)
        raise _credentials_exception("Token inválido ou expirado")

    token_type = payload.get("typ")
    if token_type != expected_type:
        audit_event("token_invalid_type", expected_type=expected_type, provided_type=token_type)
        raise _credentials_exception("Tipo de token inválido")

    return payload


def obter_usuario_logado(
    token: str = Depends(oauth2_scheme),
    conn: sqlite3.Connection = Depends(get_db),
) -> dict:
    from app.repositories import user_repo

    payload = extrair_payload(token, expected_type="access")

    try:
        user_id = int(payload.get("sub"))
    except (ValueError, TypeError):
        raise _credentials_exception("Token inválido")

    user = user_repo.buscar_usuario_por_id(conn, user_id)
    if not user:
        raise _credentials_exception("Token inválido")
    return user


def _credentials_exception(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )
