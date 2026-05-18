from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.rate_limit import rate_limiter


def client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def enforce_login_rate_limit(request: Request, email: str) -> None:
    ip = client_ip(request)
    rate_limiter.enforce(
        key=f"login:ip:{ip}",
        limit=settings.rate_limit_login_per_min,
        window_seconds=60,
        event="login",
    )
    rate_limiter.enforce(
        key=f"login:email:{email.lower()}",
        limit=settings.rate_limit_login_per_min,
        window_seconds=60,
        event="login",
    )


def enforce_refresh_rate_limit(request: Request, user_id: int | None = None) -> None:
    ip = client_ip(request)
    rate_limiter.enforce(
        key=f"refresh:ip:{ip}",
        limit=settings.rate_limit_refresh_per_min,
        window_seconds=60,
        event="refresh",
    )
    if user_id is not None:
        rate_limiter.enforce(
            key=f"refresh:user:{user_id}",
            limit=settings.rate_limit_refresh_per_min,
            window_seconds=60,
            event="refresh",
        )


def enforce_phone_code_send_rate_limit(request: Request, phone_e164: str) -> None:
    ip = client_ip(request)
    rate_limiter.enforce(
        key=f"phone-send:ip:{ip}",
        limit=settings.rate_limit_phone_send_per_min,
        window_seconds=60,
        event="phone_code_send",
    )
    rate_limiter.enforce(
        key=f"phone-send:phone:{phone_e164}",
        limit=settings.rate_limit_phone_send_per_min,
        window_seconds=60,
        event="phone_code_send",
    )


def enforce_phone_code_verify_rate_limit(request: Request, phone_e164: str) -> None:
    ip = client_ip(request)
    rate_limiter.enforce(
        key=f"phone-verify:ip:{ip}",
        limit=settings.rate_limit_phone_verify_per_min,
        window_seconds=60,
        event="phone_code_verify",
    )
    rate_limiter.enforce(
        key=f"phone-verify:phone:{phone_e164}",
        limit=settings.rate_limit_phone_verify_per_min,
        window_seconds=60,
        event="phone_code_verify",
    )


def enforce_api_rate_limit(request: Request, user_id: int | None = None) -> None:
    ip = client_ip(request)
    rate_limiter.enforce(
        key=f"api:ip:{ip}",
        limit=settings.rate_limit_api_per_min,
        window_seconds=60,
        event="api",
    )
    if user_id is not None:
        rate_limiter.enforce(
            key=f"api:user:{user_id}",
            limit=settings.rate_limit_api_per_min,
            window_seconds=60,
            event="api",
        )


def deny_forbidden(detail: str = "Acesso negado") -> None:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
