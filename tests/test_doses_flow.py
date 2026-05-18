import sqlite3
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app import database

FUSO = ZoneInfo("America/Sao_Paulo")
MED = {"nome": "Losartana", "dosagem": "50mg", "observacao": ""}
CONTATO = {"nome": "Cuidador", "telefone": "11988880000", "parentesco": "Filho"}


def _hoje():
    return datetime.now(FUSO).strftime("%Y-%m-%d")


def _criar_stack(client, headers, frequencia="diario"):
    """Cria medicamento + contato + agendamento. Retorna (med_id, contato_id, agend_id)."""
    med_id = client.post("/api/medicamentos", json=MED, headers=headers).json()["id"]
    contato_id = client.post("/api/contatos", json=CONTATO, headers=headers).json()["id"]
    dias_semana = None
    if frequencia == "semanal":
        dias_semana = [int(datetime.now(FUSO).strftime("%w"))]
    agend = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "dias_semana" if frequencia == "semanal" else "diario",
        "dias_semana": dias_semana,
        "horarios": ["08:00"],
        "data_inicio": _hoje(),
    }
    agend_id = client.post("/api/agendamentos", json=agend, headers=headers).json()["id"]
    return med_id, contato_id, agend_id


# ---------- Fluxo diário completo ----------

def test_fluxo_diario_completo(client, headers_a):
    _criar_stack(client, headers_a)

    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    assert len(doses) == 1
    dose = doses[0]
    assert dose["status"] == "PENDENTE"

    r = client.put(f"/api/confirmacoes/{dose['confirmacao_id']}/confirmar", headers=headers_a)
    assert r.status_code == 200
    assert r.json()["status"] == "CONFIRMADO"


def test_confirmacao_persistida_em_utc_iso_com_offset(client, headers_a):
    _criar_stack(client, headers_a)

    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    confirmacao_id = doses[0]["confirmacao_id"]

    r = client.put(f"/api/confirmacoes/{confirmacao_id}/confirmar", headers=headers_a)

    assert r.status_code == 200

    conn = sqlite3.connect(database.DATABASE_PATH)
    try:
        row = conn.execute(
            "SELECT data_hora_confirmacao FROM confirmacoes WHERE id = ?",
            (confirmacao_id,),
        ).fetchone()
    finally:
        conn.close()

    persisted = row[0]
    assert persisted.endswith("+00:00")
    assert datetime.fromisoformat(persisted).tzinfo == timezone.utc


def test_doses_hoje_retorna_confirmacao_convertida_para_timezone_do_usuario(client, headers_a):
    _criar_stack(client, headers_a)

    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    confirmacao_id = doses[0]["confirmacao_id"]
    client.put(f"/api/confirmacoes/{confirmacao_id}/confirmar", headers=headers_a)

    atualizadas = client.get("/api/doses/hoje", headers=headers_a).json()

    assert atualizadas[0]["horario_confirmacao"].endswith("-03:00")


def test_busca_confirmacao_individual_normaliza_timestamp_para_timezone_do_usuario(client, headers_a):
    _criar_stack(client, headers_a)

    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    confirmacao_id = doses[0]["confirmacao_id"]
    client.put(f"/api/confirmacoes/{confirmacao_id}/confirmar", headers=headers_a)

    confirmacao = client.get(f"/api/confirmacoes/{confirmacao_id}", headers=headers_a)

    assert confirmacao.status_code == 200
    assert confirmacao.json()["data_hora_confirmacao"].endswith("-03:00")


def test_doses_hoje_le_confirmacao_legada_em_utc_sem_deslocamento_visual_indevido(client, headers_a):
    _criar_stack(client, headers_a)
    client.get("/api/doses/hoje", headers=headers_a)

    conn = sqlite3.connect(database.DATABASE_PATH)
    try:
        conn.execute(
            """
            UPDATE confirmacoes
            SET status = 'CONFIRMADO', data_hora_confirmacao = ?
            WHERE data_hora_prevista = ?
            """,
            ("2026-05-18T11:05:00+00:00", f"{_hoje()} 08:00:00"),
        )
        conn.commit()
    finally:
        conn.close()

    doses = client.get("/api/doses/hoje", headers=headers_a).json()

    assert doses[0]["horario_confirmacao"].startswith("2026-05-18T08:05:00")


def test_doses_hoje_le_confirmacao_legada_local_sem_deslocamento_indevido(client, headers_a):
    _criar_stack(client, headers_a)
    client.get("/api/doses/hoje", headers=headers_a)

    conn = sqlite3.connect(database.DATABASE_PATH)
    try:
        conn.execute(
            """
            UPDATE confirmacoes
            SET status = 'CONFIRMADO', data_hora_confirmacao = ?
            WHERE data_hora_prevista = ?
            """,
            ("2026-05-18 08:05:00", f"{_hoje()} 08:00:00"),
        )
        conn.commit()
    finally:
        conn.close()

    doses = client.get("/api/doses/hoje", headers=headers_a).json()

    assert doses[0]["horario_confirmacao"].startswith("2026-05-18T08:05:00")


def test_doses_nao_duplicadas(client, headers_a):
    _criar_stack(client, headers_a)
    client.get("/api/doses/hoje", headers=headers_a)
    client.get("/api/doses/hoje", headers=headers_a)

    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    assert len(doses) == 1


def test_agendamento_diario_com_dois_horarios_gera_duas_doses(client, headers_a):
    med_id = client.post("/api/medicamentos", json=MED, headers=headers_a).json()["id"]
    contato_id = client.post("/api/contatos", json=CONTATO, headers=headers_a).json()["id"]
    assert contato_id > 0

    agend = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "diario",
        "dias_semana": None,
        "horarios": ["08:00", "20:00"],
        "data_inicio": _hoje(),
    }
    client.post("/api/agendamentos", json=agend, headers=headers_a)

    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    assert len(doses) == 2
    assert [dose["horario_previsto"][11:16] for dose in doses] == ["08:00", "20:00"]


def test_dose_confirmada_nao_gera_nova_pendente_no_mesmo_horario(client, headers_a):
    _criar_stack(client, headers_a)

    primeira_resposta = client.get("/api/doses/hoje", headers=headers_a).json()
    confirmacao_id = primeira_resposta[0]["confirmacao_id"]

    confirmada = client.put(f"/api/confirmacoes/{confirmacao_id}/confirmar", headers=headers_a)
    assert confirmada.status_code == 200
    assert confirmada.json()["status"] == "CONFIRMADO"

    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    assert len(doses) == 1
    assert doses[0]["confirmacao_id"] == confirmacao_id
    assert doses[0]["status"] == "CONFIRMADO"


# ---------- Frequência semanal ----------

def test_agendamento_semanal_dia_correto(client, headers_a):
    """data_inicio = hoje → geração no mesmo dia da semana → gera dose."""
    _criar_stack(client, headers_a, frequencia="semanal")
    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    assert len(doses) == 1


def test_agendamento_semanal_dia_errado(client, headers_a):
    """data_inicio = ontem → dia da semana diferente → não gera dose hoje."""
    med_id = client.post("/api/medicamentos", json=MED, headers=headers_a).json()["id"]
    ontem = (datetime.now(FUSO) - timedelta(days=1)).strftime("%Y-%m-%d")
    agend = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "dias_semana",
        "dias_semana": [int(datetime.strptime(ontem, "%Y-%m-%d").strftime("%w"))],
        "horarios": ["08:00"],
        "data_inicio": ontem,
    }
    client.post("/api/agendamentos", json=agend, headers=headers_a)
    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    assert len(doses) == 0


def test_agendamento_por_dias_especificos_dia_nao_selecionado_nao_gera_dose(client, headers_a):
    med_id = client.post("/api/medicamentos", json=MED, headers=headers_a).json()["id"]
    dia_hoje = int(datetime.now(FUSO).strftime("%w"))
    outro_dia = (dia_hoje + 1) % 7
    agend = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "dias_semana",
        "dias_semana": [outro_dia],
        "horarios": ["08:00"],
        "data_inicio": _hoje(),
    }
    client.post("/api/agendamentos", json=agend, headers=headers_a)

    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    assert doses == []


# ---------- Dose vencida → NAO_CONFIRMADO + notificação ----------

def test_dose_vencida_gera_notificacao(client, headers_a):
    from app.services.monitor_service import varrer_e_notificar

    _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)

    # Cria confirmação com horário 1 hora atrás no timezone do usuário
    prevista = (datetime.now(FUSO) - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
    payload = {
        "id_agendamento": agend_id,
        "data_hora_prevista": prevista,
        "status": "PENDENTE",
    }
    r = client.post("/api/confirmacoes", json=payload, headers=headers_a)
    assert r.status_code == 201
    confirmacao_id = r.json()["id"]

    resultado = varrer_e_notificar()
    assert resultado["notificacoes_criadas"] >= 1
    assert resultado["confirmacoes_atualizadas"] >= 1

    # Status deve ser NAO_CONFIRMADO, nunca mais ATRASADO
    r2 = client.get(f"/api/confirmacoes/{confirmacao_id}", headers=headers_a)
    assert r2.json()["status"] == "NAO_CONFIRMADO"


def test_dose_vencida_nao_fica_atrasado(client, headers_a):
    """Garante explicitamente que ATRASADO não aparece mais após varredura."""
    from app.services.monitor_service import varrer_e_notificar

    _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)

    prevista = (datetime.now(FUSO) - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
    payload = {
        "id_agendamento": agend_id,
        "data_hora_prevista": prevista,
        "status": "PENDENTE",
    }
    r = client.post("/api/confirmacoes", json=payload, headers=headers_a)
    confirmacao_id = r.json()["id"]

    varrer_e_notificar()

    r2 = client.get(f"/api/confirmacoes/{confirmacao_id}", headers=headers_a)
    status = r2.json()["status"]
    assert status != "ATRASADO", f"Status não deve ser ATRASADO, mas foi: {status}"
    assert status == "NAO_CONFIRMADO"


def test_dose_pendente_dentro_prazo_nao_alterada(client, headers_a):
    """Doses dentro do prazo de tolerância não devem ser tocadas pela varredura."""
    from app.services.monitor_service import varrer_e_notificar

    _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)

    # Horário de 4 minutos atrás — ainda dentro da tolerância de 5 minutos.
    prevista = (datetime.now(FUSO) - timedelta(minutes=4)).strftime("%Y-%m-%d %H:%M:%S")
    payload = {
        "id_agendamento": agend_id,
        "data_hora_prevista": prevista,
        "status": "PENDENTE",
    }
    r = client.post("/api/confirmacoes", json=payload, headers=headers_a)
    confirmacao_id = r.json()["id"]

    varrer_e_notificar()

    r2 = client.get(f"/api/confirmacoes/{confirmacao_id}", headers=headers_a)
    assert r2.json()["status"] == "PENDENTE"


def test_dose_pendente_fora_da_tolerancia_de_cinco_minutos_gera_alerta(client, headers_a):
    """Confirma explicitamente a nova regra de 5 minutos."""
    from app.services.monitor_service import varrer_e_notificar

    _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)

    prevista = (datetime.now(FUSO) - timedelta(minutes=6)).strftime("%Y-%m-%d %H:%M:%S")
    payload = {
        "id_agendamento": agend_id,
        "data_hora_prevista": prevista,
        "status": "PENDENTE",
    }
    r = client.post("/api/confirmacoes", json=payload, headers=headers_a)
    confirmacao_id = r.json()["id"]

    resultado = varrer_e_notificar()

    assert resultado["confirmacoes_atualizadas"] >= 1
    assert resultado["notificacoes_criadas"] >= 1

    r2 = client.get(f"/api/confirmacoes/{confirmacao_id}", headers=headers_a)
    assert r2.json()["status"] == "NAO_CONFIRMADO"
