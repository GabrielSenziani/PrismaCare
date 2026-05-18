from typing import Literal, Optional

from pydantic import BaseModel, field_validator


class PushTokenRegisterRequest(BaseModel):
    expo_push_token: str
    platform: Literal["android", "ios"]
    device_name: Optional[str] = None

    @field_validator("expo_push_token")
    @classmethod
    def token_valido(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Expo push token é obrigatório")
        if not (
            normalized.startswith("ExponentPushToken[")
            or normalized.startswith("ExpoPushToken[")
        ):
            raise ValueError("Expo push token inválido")
        return normalized

    @field_validator("device_name")
    @classmethod
    def normalizar_device_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class PushTokenUnregisterRequest(BaseModel):
    expo_push_token: str

    @field_validator("expo_push_token")
    @classmethod
    def token_valido(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Expo push token é obrigatório")
        return normalized


class PushTokenResponse(BaseModel):
    id: int
    id_usuario: int
    expo_push_token: str
    platform: Literal["android", "ios"]
    device_name: Optional[str] = None
    ativo: bool
    ultimo_erro: Optional[str] = None
    created_at: str
    updated_at: str
