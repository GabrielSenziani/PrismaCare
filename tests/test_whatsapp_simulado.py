from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

FUSO = ZoneInfo("America/Sao_Paulo")

MED = {"nome": "Paracetamol", "dosagem": "750mg", "observacao": ""}
CONTATO_1 = {"nome": "Filho", "telefone": "11988880001", "parentesco": "Filho"}
CONTATO_2 = {"nome": "Filha", "telefone": "11988880002", "parentesco": "Filha"}


def _prevista_vencida():
    return (datetime.now(FUSO) - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")


def _horario_vencido():
    return _prevista_vencida().split(" ")[1][:5]


def _criar_stack(client, headers, contato=CONTATO_1):
    med_id = client.post("/api/medicamentos", json=MED, headers=headers).json()["id"]
    contato_id = client.post("/api/contatos", json=contato, headers=headers).json()["id"]
    agend = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "diario",
        "dias_semana": None,
        "horarios": [_horario_vencido()],
        "data_inicio": datetime.now(FUSO).strftime("%Y-%m-%d"),
    }
    agend_id = client.post("/api/agendamentos", json=agend, headers=headers).json()["id"]
    return med_id, contato_id, agend_id


def _criar_confirmacao_vencida(client, headers, agend_id):
    r = client.get("/api/doses/hoje", headers=headers)
    assert r.status_code == 200
    doses = r.json()
    dose = next((item for item in doses if item["confirmacao_id"] and item["status"] == "PENDENTE"), None)
    assert dose is not None
    return dose["confirmacao_id"]


# Cenário 1 — notificação simulada fica com status ENVIADO
def test_notificacao_simulada_fica_enviada(client, headers_a):
    from app.services.monitor_service import varrer_e_notificar

    _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)
    _criar_confirmacao_vencida(client, headers_a, agend_id)

    resultado = varrer_e_notificar()
    assert resultado["notificacoes_criadas"] == 1
    assert resultado["notificacoes_enviadas"] == 1

    notificacoes = client.get("/api/notificacoes", headers=headers_a).json()
    assert len(notificacoes) == 1
    n = notificacoes[0]
    assert n["status_envio"] == "ENVIADO"
    assert n["data_hora_envio"] is not None
    assert n["tipo_mensagem"] == "WHATSAPP"


# Cenário 2 — varredura dupla não duplica notificação
def test_nao_duplica_notificacao(client, headers_a):
    from app.services.monitor_service import varrer_e_notificar

    _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)
    _criar_confirmacao_vencida(client, headers_a, agend_id)

    varrer_e_notificar()
    resultado2 = varrer_e_notificar()

    assert resultado2["notificacoes_criadas"] == 0
    assert resultado2["notificacoes_enviadas"] == 0

    notificacoes = client.get("/api/notificacoes", headers=headers_a).json()
    assert len(notificacoes) == 1


def test_dose_confirmada_nao_envia_alerta_ao_contato(client, headers_a):
    from app.services.monitor_service import varrer_e_notificar

    _med_id, _contato_id, agend_id = _criar_stack(client, headers_a)
    confirmacao_id = _criar_confirmacao_vencida(client, headers_a, agend_id)

    confirmada = client.put(f"/api/confirmacoes/{confirmacao_id}/confirmar", headers=headers_a)
    assert confirmada.status_code == 200
    assert confirmada.json()["status"] == "CONFIRMADO"

    resultado = varrer_e_notificar()
    assert resultado["confirmacoes_atualizadas"] == 0
    assert resultado["notificacoes_criadas"] == 0
    assert resultado["notificacoes_enviadas"] == 0

    notificacoes = client.get("/api/notificacoes", headers=headers_a).json()
    assert notificacoes == []


# Cenário 3 — múltiplos contatos recebem notificações individuais
def test_multiplos_contatos(client, headers_a):
    from app.services.monitor_service import varrer_e_notificar

    med_id = client.post("/api/medicamentos", json=MED, headers=headers_a).json()["id"]
    client.post("/api/contatos", json=CONTATO_1, headers=headers_a)
    client.post("/api/contatos", json=CONTATO_2, headers=headers_a)
    agend = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "diario",
        "dias_semana": None,
        "horarios": [_horario_vencido()],
        "data_inicio": datetime.now(FUSO).strftime("%Y-%m-%d"),
    }
    agend_id = client.post("/api/agendamentos", json=agend, headers=headers_a).json()["id"]
    _criar_confirmacao_vencida(client, headers_a, agend_id)

    resultado = varrer_e_notificar()
    assert resultado["notificacoes_criadas"] == 2
    assert resultado["notificacoes_enviadas"] == 2

    notificacoes = client.get("/api/notificacoes", headers=headers_a).json()
    assert len(notificacoes) == 2
    assert all(n["status_envio"] == "ENVIADO" for n in notificacoes)


# Cenário 4 — usuário sem contato não gera erro nem notificação
def test_usuario_sem_contato_nao_quebra(client, headers_a):
    from app.services.monitor_service import varrer_e_notificar

    med_id = client.post("/api/medicamentos", json=MED, headers=headers_a).json()["id"]
    agend = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "diario",
        "dias_semana": None,
        "horarios": [_horario_vencido()],
        "data_inicio": datetime.now(FUSO).strftime("%Y-%m-%d"),
    }
    agend_id = client.post("/api/agendamentos", json=agend, headers=headers_a).json()["id"]
    _criar_confirmacao_vencida(client, headers_a, agend_id)

    resultado = varrer_e_notificar()
    assert resultado["confirmacoes_atualizadas"] == 1
    assert resultado["notificacoes_criadas"] == 0
    assert resultado["notificacoes_enviadas"] == 0

    notificacoes = client.get("/api/notificacoes", headers=headers_a).json()
    assert len(notificacoes) == 0


def test_varredura_gera_confirmacao_do_dia_antes_de_notificar(client, headers_a, monkeypatch):
    from app.services.monitor_service import varrer_e_notificar

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            current = datetime(2026, 5, 19, 10, 30, 0)
            if tz is not None:
                return current.replace(tzinfo=tz)
            return current

    monkeypatch.setattr("app.services.monitor_service.datetime", FixedDateTime)

    med_id = client.post("/api/medicamentos", json=MED, headers=headers_a).json()["id"]
    client.post("/api/contatos", json=CONTATO_1, headers=headers_a)
    agend = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "diario",
        "dias_semana": None,
        "horarios": ["08:00"],
        "data_inicio": "2026-05-19",
    }
    client.post("/api/agendamentos", json=agend, headers=headers_a)

    resultado = varrer_e_notificar()
    assert resultado["confirmacoes_atualizadas"] == 1
    assert resultado["notificacoes_criadas"] == 1
    assert resultado["notificacoes_enviadas"] == 1

    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    assert len(doses) == 1
    assert doses[0]["status"] == "NAO_CONFIRMADO"

    notificacoes = client.get("/api/notificacoes", headers=headers_a).json()
    assert len(notificacoes) == 1
    assert notificacoes[0]["status_envio"] == "ENVIADO"
