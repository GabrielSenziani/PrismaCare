import re
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, field_validator, model_validator

TipoRecorrencia = Literal["diario", "dias_semana"]
HORARIO_REGEX = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def _normalizar_horarios(horarios: list[str]) -> list[str]:
    normalizados = [horario.strip() for horario in horarios]
    if not normalizados:
        raise ValueError("Informe pelo menos um horário")
    if any(not HORARIO_REGEX.match(horario) for horario in normalizados):
        raise ValueError("Horários devem estar no formato HH:MM entre 00:00 e 23:59")
    if len(set(normalizados)) != len(normalizados):
        raise ValueError("Horários duplicados não são permitidos")
    return sorted(normalizados)


def _normalizar_dias_semana(dias_semana: list[int] | None) -> list[int] | None:
    if dias_semana is None:
        return None
    if not dias_semana:
        return []
    if any(dia < 0 or dia > 6 for dia in dias_semana):
        raise ValueError("dias_semana deve conter apenas valores entre 0 e 6")
    if len(set(dias_semana)) != len(dias_semana):
        raise ValueError("dias_semana não pode conter valores duplicados")
    return sorted(dias_semana)


class AgendamentoCreate(BaseModel):
    id_medicamento: int
    tipo_recorrencia: TipoRecorrencia
    dias_semana: Optional[list[int]] = None
    horarios: list[str]
    data_inicio: date
    data_fim: Optional[date] = None
    ativo: bool = True

    @field_validator("data_fim")
    @classmethod
    def data_fim_apos_inicio(cls, value, info):
        if value is not None and "data_inicio" in info.data and value < info.data["data_inicio"]:
            raise ValueError("data_fim não pode ser anterior à data_inicio")
        return value

    @field_validator("horarios")
    @classmethod
    def horarios_validos(cls, value: list[str]) -> list[str]:
        return _normalizar_horarios(value)

    @field_validator("dias_semana")
    @classmethod
    def dias_semana_validos(cls, value: list[int] | None) -> list[int] | None:
        return _normalizar_dias_semana(value)

    @model_validator(mode="after")
    def validar_recorrencia(self):
        if self.tipo_recorrencia == "diario":
            if self.dias_semana not in (None, []):
                raise ValueError("dias_semana deve ser vazio para recorrência diária")
            self.dias_semana = None
            return self

        if not self.dias_semana:
            raise ValueError("dias_semana é obrigatório para recorrência por dias da semana")
        return self


class AgendamentoResponse(BaseModel):
    id: int
    id_medicamento: int
    tipo_recorrencia: TipoRecorrencia
    dias_semana: Optional[list[int]] = None
    horarios: list[str]
    data_inicio: date
    data_fim: Optional[date] = None
    ativo: bool


class AgendamentoUpdate(BaseModel):
    id_medicamento: Optional[int] = None
    tipo_recorrencia: Optional[TipoRecorrencia] = None
    dias_semana: Optional[list[int]] = None
    horarios: Optional[list[str]] = None
    data_inicio: Optional[date] = None
    data_fim: Optional[date] = None
    ativo: Optional[bool] = None

    @field_validator("horarios")
    @classmethod
    def horarios_validos(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        return _normalizar_horarios(value)

    @field_validator("dias_semana")
    @classmethod
    def dias_semana_validos(cls, value: list[int] | None) -> list[int] | None:
        return _normalizar_dias_semana(value)

    @model_validator(mode="after")
    def validar(self):
        if not self.model_fields_set:
            raise ValueError("Envie pelo menos um campo para atualizar")
        if self.data_fim and self.data_inicio and self.data_fim < self.data_inicio:
            raise ValueError("data_fim não pode ser anterior a data_inicio")
        if self.tipo_recorrencia == "diario" and self.dias_semana not in (None, []):
            raise ValueError("dias_semana deve ser vazio para recorrência diária")
        if self.tipo_recorrencia == "dias_semana" and not self.dias_semana:
            raise ValueError("dias_semana é obrigatório para recorrência por dias da semana")
        return self
