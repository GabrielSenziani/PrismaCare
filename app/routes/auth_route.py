import sqlite3
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, field_validator

from app.core.audit import audit_event
from app.core.config import settings
from app.core.phone_auth import (
    PHONE_CODE_MAX_ATTEMPTS,
    PHONE_CODE_TTL_SECONDS,
    build_phone_code_message,
    format_phone_display,
    generate_phone_code,
    normalize_phone_br_auth,
)
from app.core.security_controls import (
    client_ip,
    enforce_login_rate_limit,
    enforce_phone_code_send_rate_limit,
    enforce_phone_code_verify_rate_limit,
    enforce_refresh_rate_limit,
    user_agent,
)
from app.database import get_db
from app.repositories import auth_repo, user_repo
from app.security import (
    extrair_payload,
    gerar_par_tokens,
    gerar_phone_verification_token,
    hash_senha,
    hash_token,
    validar_forca_senha,
    verificar_senha,
)
from app.services.whatsapp_service import enviar_whatsapp

router = APIRouter(prefix="/auth", tags=["Auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class LookupEmailRequest(BaseModel):
    email: str


class RegisterRequest(BaseModel):
    email: str
    password: str


class GoogleLoginRequest(BaseModel):
    id_token: str


class PhoneLookupRequest(BaseModel):
    ddd: str
    numero: str


class PhoneCodeVerifyRequest(BaseModel):
    ddd: str
    numero: str
    codigo: str

    @field_validator("codigo")
    @classmethod
    def codigo_valido(cls, value: str) -> str:
        digits = "".join(ch for ch in value if ch.isdigit())
        if len(digits) != 6:
            raise ValueError("Código inválido")
        return digits


class CompletePhoneRegistrationRequest(BaseModel):
    verification_token: str
    nome: str

    @field_validator("nome")
    @classmethod
    def nome_valido(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Nome deve ter pelo menos 2 caracteres")
        if len(normalized) > 60:
            raise ValueError("Nome deve ter no máximo 60 caracteres")
        return normalized


def _auth_response(user: dict, access_token: str, refresh_token: str) -> dict:
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.access_ttl_min * 60,
        "user": {
            "id": user["id"],
            "nome": user["nome"],
            "email": user["email"],
        },
    }


def _normalize_email(email: str) -> str:
    value = email.lower().strip()
    if "@" not in value or "." not in value:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="E-mail inválido")
    return value


def _normalize_phone_payload(ddd: str, numero: str) -> tuple[str, str]:
    try:
        return normalize_phone_br_auth(ddd, numero)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


def _criar_sessao_auth(
    conn: sqlite3.Connection,
    request: Request,
    user: dict,
    event: str,
) -> dict:
    ip = client_ip(request)
    ua = user_agent(request)
    access_token, refresh_token, session_id = gerar_par_tokens(user["id"], user.get("email"))
    refresh_payload = extrair_payload(refresh_token, expected_type="refresh")
    auth_repo.criar_refresh_token(
        conn,
        user_id=user["id"],
        session_id=session_id,
        token_hash=hash_token(refresh_token),
        expires_at=datetime.fromtimestamp(refresh_payload["exp"], timezone.utc).isoformat(),
        ip=ip,
        user_agent=ua,
    )
    auth_repo.registrar_evento_auth(
        conn,
        event=event,
        success=True,
        user_id=user["id"],
        email=user.get("email"),
        ip=ip,
        user_agent=ua,
    )
    audit_event(event, user_id=user["id"], ip=ip)
    return _auth_response(user, access_token, refresh_token)


def process_login(
    conn: sqlite3.Connection,
    request: Request,
    username: str,
    password: str,
) -> dict:
    email = username.lower().strip()
    ip = client_ip(request)
    ua = user_agent(request)

    enforce_login_rate_limit(request, email)

    blocked, locked_until = auth_repo.login_bloqueado(conn, email=email, ip=ip)
    if not blocked:
        blocked, locked_until = auth_repo.login_bloqueado_por_email(conn, email=email)
    if blocked:
        auth_repo.registrar_evento_auth(
            conn,
            event="login_blocked",
            success=False,
            user_id=None,
            email=email,
            ip=ip,
            user_agent=ua,
            reason=f"locked_until={locked_until}",
        )
        audit_event("login_blocked", email=email, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Conta temporariamente bloqueada por tentativas inválidas",
        )

    user = user_repo.buscar_usuario_por_email(conn, email)
    if not user or not user.get("senha") or not verificar_senha(password, user["senha"]):
        lock = auth_repo.registrar_falha_login(
            conn,
            email=email,
            ip=ip,
            threshold=settings.login_lockout_threshold,
            base_lockout_minutes=settings.login_lockout_minutes,
            max_lockout_minutes=settings.login_lockout_max_minutes,
        )
        email_lock = auth_repo.registrar_falha_login_email(
            conn,
            email=email,
            threshold=settings.email_lockout_threshold,
            base_lockout_minutes=settings.email_lockout_minutes,
            max_lockout_minutes=settings.email_lockout_max_minutes,
        )
        auth_repo.registrar_evento_auth(
            conn,
            event="login_failed",
            success=False,
            user_id=user["id"] if user else None,
            email=email,
            ip=ip,
            user_agent=ua,
            reason=f"failed_count={lock['failed_count']} email_failed_count={email_lock['failed_count']}",
        )
        audit_event("login_failed", email=email, ip=ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha incorretos")

    auth_repo.resetar_falhas_login(conn, email=email, ip=ip)
    auth_repo.resetar_falhas_login_email(conn, email=email)

    return _criar_sessao_auth(conn, request, user, "login_success")


def process_google_login(
    conn: sqlite3.Connection,
    request: Request,
    google_token: str,
) -> dict:
    ip = client_ip(request)
    ua = user_agent(request)

    try:
        payload = google_id_token.verify_oauth2_token(
            google_token,
            google_requests.Request(),
            settings.google_web_client_id,
        )
    except ValueError:
        auth_repo.registrar_evento_auth(
            conn,
            event="google_login_failed",
            success=False,
            user_id=None,
            email=None,
            ip=ip,
            user_agent=ua,
            reason="invalid_id_token",
        )
        audit_event("google_login_failed", ip=ip, reason="invalid_id_token")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token Google inválido")

    if payload.get("aud") != settings.google_web_client_id:
        auth_repo.registrar_evento_auth(
            conn,
            event="google_login_failed",
            success=False,
            user_id=None,
            email=None,
            ip=ip,
            user_agent=ua,
            reason="invalid_audience",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token Google inválido")

    raw_email = payload.get("email")
    if not isinstance(raw_email, str) or not raw_email.strip():
        auth_repo.registrar_evento_auth(
            conn,
            event="google_login_failed",
            success=False,
            user_id=None,
            email=None,
            ip=ip,
            user_agent=ua,
            reason="missing_email",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Conta Google sem e-mail válido")

    if payload.get("email_verified") is not True:
        auth_repo.registrar_evento_auth(
            conn,
            event="google_login_failed",
            success=False,
            user_id=None,
            email=raw_email,
            ip=ip,
            user_agent=ua,
            reason="email_not_verified",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Conta Google precisa ter e-mail verificado")

    email = raw_email.strip().lower()
    enforce_login_rate_limit(request, email)

    google_sub = payload.get("sub")
    if not isinstance(google_sub, str) or not google_sub.strip():
        auth_repo.registrar_evento_auth(
            conn,
            event="google_login_failed",
            success=False,
            user_id=None,
            email=email,
            ip=ip,
            user_agent=ua,
            reason="missing_google_sub",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token Google inválido")

    google_sub = google_sub.strip()
    name = payload.get("name")
    avatar_url = payload.get("picture")

    user = user_repo.buscar_usuario_por_google_sub(conn, google_sub)
    if not user:
        existing_by_email = user_repo.buscar_usuario_por_email(conn, email)
        if existing_by_email:
            user = user_repo.vincular_google_identity(
                conn,
                existing_by_email["id"],
                google_sub=google_sub,
                avatar_url=avatar_url if isinstance(avatar_url, str) else None,
            )
        else:
            generated_password = secrets.token_urlsafe(32)
            user = user_repo.criar_usuario(
                conn,
                nome=name.strip() if isinstance(name, str) and name.strip() else None,
                telefone=None,
                email=email,
                senha=hash_senha(generated_password),
                data_nascimento=None,
                auth_provider="google",
                google_sub=google_sub,
                avatar_url=avatar_url if isinstance(avatar_url, str) else None,
            )

    return _criar_sessao_auth(conn, request, user, "google_login_success")


@router.post("/lookup-email")
def lookup_email(
    request: Request,
    payload: LookupEmailRequest,
    conn: sqlite3.Connection = Depends(get_db),
):
    email = _normalize_email(payload.email)
    enforce_login_rate_limit(request, email)
    return {"exists": user_repo.buscar_usuario_por_email(conn, email) is not None}


@router.post("/lookup-phone")
def lookup_phone(payload: PhoneLookupRequest):
    _, formatted_phone = _normalize_phone_payload(payload.ddd, payload.numero)
    return {
        "ok": True,
        "formatted_phone": formatted_phone,
        "channel": "whatsapp",
    }


@router.post("/send-phone-code")
def send_phone_code(
    request: Request,
    payload: PhoneLookupRequest,
    conn: sqlite3.Connection = Depends(get_db),
):
    phone_e164, formatted_phone = _normalize_phone_payload(payload.ddd, payload.numero)
    enforce_phone_code_send_rate_limit(request, phone_e164)

    auth_repo.registrar_evento_auth(
        conn,
        event="phone_code_requested",
        success=True,
        user_id=None,
        email=None,
        ip=client_ip(request),
        user_agent=user_agent(request),
        reason=f"phone={phone_e164}",
    )

    auth_repo.invalidar_codigos_telefone_ativos(conn, phone_e164)
    code = generate_phone_code()
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=PHONE_CODE_TTL_SECONDS)).isoformat()
    code_entry = auth_repo.criar_codigo_telefone(
        conn,
        phone_e164=phone_e164,
        code_hash=hash_token(code),
        expires_at=expires_at,
    )

    message = build_phone_code_message(code)
    send_result = enviar_whatsapp(phone_e164, message)
    if send_result["status_envio"] != "ENVIADO":
        auth_repo.invalidar_codigo_telefone(conn, code_entry["id"])
        auth_repo.registrar_evento_auth(
            conn,
            event="phone_code_sent",
            success=False,
            user_id=None,
            email=None,
            ip=client_ip(request),
            user_agent=user_agent(request),
            reason=send_result.get("error") or "send_failed",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível enviar seu código pelo WhatsApp agora. Tente novamente em instantes.",
        )

    auth_repo.registrar_evento_auth(
        conn,
        event="phone_code_sent",
        success=True,
        user_id=None,
        email=None,
        ip=client_ip(request),
        user_agent=user_agent(request),
        reason=f"phone={phone_e164}",
    )
    return {
        "ok": True,
        "formatted_phone": formatted_phone,
        "expires_in_seconds": PHONE_CODE_TTL_SECONDS,
    }


@router.post("/verify-phone-code")
def verify_phone_code(
    request: Request,
    payload: PhoneCodeVerifyRequest,
    conn: sqlite3.Connection = Depends(get_db),
):
    phone_e164, formatted_phone = _normalize_phone_payload(payload.ddd, payload.numero)
    enforce_phone_code_verify_rate_limit(request, phone_e164)

    current_code = auth_repo.buscar_codigo_telefone_ativo(conn, phone_e164)
    if not current_code:
        auth_repo.registrar_evento_auth(
            conn,
            event="phone_code_failed",
            success=False,
            user_id=None,
            email=None,
            ip=client_ip(request),
            user_agent=user_agent(request),
            reason="missing_or_expired_code",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Código inválido ou expirado")

    if current_code["code_hash"] != hash_token(payload.codigo):
        updated = auth_repo.registrar_falha_codigo_telefone(
            conn,
            current_code["id"],
            max_attempts=PHONE_CODE_MAX_ATTEMPTS,
        )
        auth_repo.registrar_evento_auth(
            conn,
            event="phone_code_failed",
            success=False,
            user_id=None,
            email=None,
            ip=client_ip(request),
            user_agent=user_agent(request),
            reason=f"invalid_code_attempts={updated['failed_attempts'] if updated else 0}",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Código inválido ou expirado")

    auth_repo.consumir_codigo_telefone(conn, current_code["id"])
    user = user_repo.buscar_usuario_por_phone_e164(conn, phone_e164)
    if user:
        if not user.get("phone_verified_at"):
            user = user_repo.marcar_telefone_verificado(
                conn,
                user["id"],
                telefone=formatted_phone,
                phone_e164=phone_e164,
                verified_at=datetime.now(timezone.utc).isoformat(),
            ) or user
        return _criar_sessao_auth(conn, request, user, "phone_login_success")

    verification_token = gerar_phone_verification_token(phone_e164)
    return {
        "authenticated": False,
        "needs_name": True,
        "verification_token": verification_token,
        "formatted_phone": formatted_phone,
    }


@router.post("/complete-phone-registration")
def complete_phone_registration(
    request: Request,
    payload: CompletePhoneRegistrationRequest,
    conn: sqlite3.Connection = Depends(get_db),
):
    decoded = extrair_payload(payload.verification_token, expected_type="phone_verification")
    phone_e164 = decoded.get("phone_e164")
    if not isinstance(phone_e164, str) or not phone_e164.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de verificação inválido")

    if user_repo.buscar_usuario_por_phone_e164(conn, phone_e164):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este telefone já está vinculado a uma conta")

    formatted_phone = format_phone_display(phone_e164)
    verified_at = datetime.now(timezone.utc).isoformat()
    user = user_repo.criar_usuario(
        conn,
        nome=payload.nome,
        telefone=formatted_phone,
        email=None,
        senha=None,
        data_nascimento=None,
        auth_provider="phone",
        phone_e164=phone_e164,
        phone_verified_at=verified_at,
    )
    return _criar_sessao_auth(conn, request, user, "phone_register_success")


@router.post("/register", status_code=201)
def register(payload: RegisterRequest, conn: sqlite3.Connection = Depends(get_db)):
    email = _normalize_email(payload.email)
    validar_forca_senha(payload.password)

    existente = user_repo.buscar_usuario_por_email(conn, email)
    if existente:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="E-mail já cadastrado")

    novo_user = user_repo.criar_usuario(
        conn,
        nome=None,
        telefone=None,
        email=email,
        senha=hash_senha(payload.password),
        data_nascimento=None,
    )
    return {
        "id": novo_user["id"],
        "email": novo_user["email"],
        "nome": novo_user["nome"],
        "telefone": novo_user["telefone"],
        "timezone_confirmed": bool(novo_user["timezone_confirmed"]),
    }


@router.post("/login")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    conn: sqlite3.Connection = Depends(get_db),
):
    return process_login(conn, request, form_data.username, form_data.password)


@router.post("/google")
def google_login(
    request: Request,
    payload: GoogleLoginRequest,
    conn: sqlite3.Connection = Depends(get_db),
):
    return process_google_login(conn, request, payload.id_token)


@router.post("/refresh")
def refresh_token(
    request: Request,
    payload: RefreshRequest,
    conn: sqlite3.Connection = Depends(get_db),
):
    decoded = extrair_payload(payload.refresh_token, expected_type="refresh")
    user_id = int(decoded["sub"])
    enforce_refresh_rate_limit(request, user_id=user_id)

    token_hash_value = hash_token(payload.refresh_token)
    current = auth_repo.buscar_refresh_token_ativo(conn, token_hash_value)
    if not current:
        auth_repo.registrar_evento_auth(
            conn,
            event="refresh_failed",
            success=False,
            user_id=user_id,
            email=decoded.get("email"),
            ip=client_ip(request),
            user_agent=user_agent(request),
            reason="token_not_active",
        )
        audit_event("refresh_failed", user_id=user_id, reason="token_not_active")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")

    if decoded.get("sid") != current["session_id"]:
        auth_repo.registrar_evento_auth(
            conn,
            event="refresh_failed",
            success=False,
            user_id=user_id,
            email=decoded.get("email"),
            ip=client_ip(request),
            user_agent=user_agent(request),
            reason="session_mismatch",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")

    user = user_repo.buscar_usuario_por_id(conn, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")

    auth_repo.revogar_refresh_token(conn, token_hash_value)

    access_token, refresh_token, session_id = gerar_par_tokens(
        user["id"], user["email"], session_id=current["session_id"]
    )
    refresh_payload = extrair_payload(refresh_token, expected_type="refresh")
    auth_repo.criar_refresh_token(
        conn,
        user_id=user["id"],
        session_id=session_id,
        token_hash=hash_token(refresh_token),
        expires_at=datetime.fromtimestamp(refresh_payload["exp"], timezone.utc).isoformat(),
        ip=client_ip(request),
        user_agent=user_agent(request),
    )

    auth_repo.registrar_evento_auth(
        conn,
        event="refresh_success",
        success=True,
        user_id=user["id"],
        email=user["email"],
        ip=client_ip(request),
        user_agent=user_agent(request),
    )
    audit_event("refresh_success", user_id=user["id"])
    return _auth_response(user, access_token, refresh_token)


@router.post("/logout")
def logout(
    request: Request,
    payload: LogoutRequest,
    token: str = Depends(oauth2_scheme),
    conn: sqlite3.Connection = Depends(get_db),
):
    decoded = extrair_payload(token, expected_type="access")
    user_id = int(decoded["sub"])
    session_id = decoded.get("sid")
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    revoked = auth_repo.revogar_sessao(conn, session_id=session_id, user_id=user_id)
    if payload.refresh_token:
        auth_repo.revogar_refresh_token(conn, hash_token(payload.refresh_token))

    auth_repo.registrar_evento_auth(
        conn,
        event="logout",
        success=True,
        user_id=user_id,
        email=decoded.get("email"),
        ip=client_ip(request),
        user_agent=user_agent(request),
        reason=f"revoked_tokens={revoked}",
    )
    audit_event("logout", user_id=user_id, revoked_tokens=revoked)
    return {"message": "Logout realizado com sucesso"}


@router.post("/logout-all")
def logout_all(
    request: Request,
    token: str = Depends(oauth2_scheme),
    conn: sqlite3.Connection = Depends(get_db),
):
    decoded = extrair_payload(token, expected_type="access")
    user_id = int(decoded["sub"])
    revoked = auth_repo.revogar_todas_sessoes(conn, user_id=user_id)

    auth_repo.registrar_evento_auth(
        conn,
        event="logout_all",
        success=True,
        user_id=user_id,
        email=decoded.get("email"),
        ip=client_ip(request),
        user_agent=user_agent(request),
        reason=f"revoked_tokens={revoked}",
    )
    audit_event("logout_all", user_id=user_id, revoked_tokens=revoked)
    return {"message": "Logout global realizado com sucesso"}
