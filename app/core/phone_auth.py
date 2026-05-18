import re
import secrets

PHONE_AUTH_COUNTRY_CODE = "55"
PHONE_CODE_TTL_SECONDS = 5 * 60
PHONE_VERIFICATION_TOKEN_TTL_SECONDS = 10 * 60
PHONE_CODE_LENGTH = 6
PHONE_CODE_MAX_ATTEMPTS = 5


def normalize_phone_br_auth(ddd: str, numero: str) -> tuple[str, str]:
    ddd_digits = _only_digits(ddd)
    numero_digits = _only_digits(numero)

    if len(ddd_digits) != 2:
        raise ValueError("DDD inválido")
    if len(numero_digits) not in {8, 9}:
        raise ValueError("Número inválido")

    phone_e164 = f"{PHONE_AUTH_COUNTRY_CODE}{ddd_digits}{numero_digits}"
    return phone_e164, format_phone_display(phone_e164)


def normalize_existing_brazil_phone(raw_phone: str | None) -> tuple[str, str] | None:
    digits = _only_digits(raw_phone)
    if not digits:
        return None

    if digits.startswith(PHONE_AUTH_COUNTRY_CODE) and len(digits) in {12, 13}:
        return digits, format_phone_display(digits)
    if len(digits) in {10, 11}:
        canonical = f"{PHONE_AUTH_COUNTRY_CODE}{digits}"
        return canonical, format_phone_display(canonical)
    return None


def format_phone_display(phone_e164: str) -> str:
    digits = _only_digits(phone_e164)
    if not digits.startswith(PHONE_AUTH_COUNTRY_CODE) or len(digits) not in {12, 13}:
        raise ValueError("Telefone inválido")

    local = digits[2:]
    ddd = local[:2]
    numero = local[2:]
    if len(numero) == 9:
        formatted_number = f"{numero[:5]}-{numero[5:]}"
    else:
        formatted_number = f"{numero[:4]}-{numero[4:]}"
    return f"+55 {ddd} {formatted_number}"


def build_phone_code_message(code: str) -> str:
    return (
        f"Seu código PrismaCare é {code}. "
        "Ele expira em 5 minutos."
    )


def generate_phone_code() -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(PHONE_CODE_LENGTH))


def looks_like_phone_candidate(value: str) -> bool:
    digits = _only_digits(value)
    return len(digits) >= 8 and "@" not in value


def split_phone_candidate(value: str) -> tuple[str, str] | None:
    digits = _only_digits(value)
    if digits.startswith(PHONE_AUTH_COUNTRY_CODE) and len(digits) in {12, 13}:
        digits = digits[2:]
    if len(digits) not in {10, 11}:
        return None
    return digits[:2], digits[2:]


def _only_digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")
