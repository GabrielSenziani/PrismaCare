import re
from pydantic import BaseModel, field_validator
from datetime import date
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

TELEFONE_REGEX = r"^\+?[\d\s\-\(\)]{8,20}$"


class UserCreate(BaseModel):
    nome: Optional[str] = None
    telefone: Optional[str] = None
    email: str
    senha: str
    data_nascimento: Optional[date] = None

    @field_validator("nome")
    @classmethod
    def nome_nao_vazio(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Nome não pode ser vazio")
        return v

    @field_validator("email")
    @classmethod
    def email_valido(cls, v):
        if "@" not in v or "." not in v:
            raise ValueError("E-mail inválido")
        return v.lower()

    @field_validator("telefone")
    @classmethod
    def telefone_valido(cls, v):
        if v is None:
            return v
        if not re.match(TELEFONE_REGEX, v):
            raise ValueError("Telefone inválido")
        return v

class UserResponse(BaseModel):
    id: int
    nome: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    data_nascimento: Optional[date] = None
    timezone: str = "America/Sao_Paulo"
    timezone_confirmed: bool = False
    phone_verified_at: Optional[str] = None


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None

    @field_validator("name")
    @classmethod
    def nome_apelido_valido(cls, v):
        if v is None:
            return v
        normalized = v.strip()
        if len(normalized) < 2:
            raise ValueError("Nome deve ter pelo menos 2 caracteres")
        if len(normalized) > 60:
            raise ValueError("Nome deve ter no máximo 60 caracteres")
        return normalized


class TimezoneUpdate(BaseModel):
    timezone: str

    @field_validator("timezone")
    @classmethod
    def timezone_iana_valido(cls, v):
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, KeyError):
            raise ValueError("Timezone inválido. Use um identificador IANA (ex: America/Sao_Paulo)")
        return v
