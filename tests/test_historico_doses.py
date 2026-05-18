from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

MED_A = {"nome": "Losartana", "dosagem": "50mg", "observacao": ""}
MED_B = {"nome": "Metformina", "dosagem": "850mg", "observacao": ""}
FUSO = ZoneInfo("America/Sao_Paulo")


def _hoje():
    return datetime.now(FUSO).strftime("%Y-%m-%d")


def _criar_agendamento(client, headers, medicamento, horario="08:00"):
    med_id = client.post("/api/medicamentos", json=medicamento, headers=headers).json()["id"]
    payload = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "diario",
        "dias_semana": None,
        "horarios": [horario],
        "data_inicio": _hoje(),
    }
    agend_id = client.post("/api/agendamentos", json=payload, headers=headers).json()["id"]
    return med_id, agend_id


def _periodo_hoje():
    hoje = _hoje()
    return f"data_inicio={hoje}&data_fim={hoje}"


def test_historico_retorna_dose_confirmada_no_periodo(client, headers_a):
    med_id, agend_id = _criar_agendamento(client, headers_a, MED_A)

    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    confirmacao_id = doses[0]["confirmacao_id"]
    r = client.put(f"/api/confirmacoes/{confirmacao_id}/confirmar", headers=headers_a)
    assert r.status_code == 200

    historico = client.get(f"/api/doses/historico?{_periodo_hoje()}", headers=headers_a)

    assert historico.status_code == 200
    assert len(historico.json()) == 1
    item = historico.json()[0]
    assert item["confirmacao_id"] == confirmacao_id
    assert item["agendamento_id"] == agend_id
    assert item["medicamento_id"] == med_id
    assert item["medicamento"] == MED_A["nome"]
    assert item["dosagem"] == MED_A["dosagem"]
    assert item["horario_previsto"] == doses[0]["horario_previsto"]
    assert item["horario_confirmacao"]
    assert item["status"] == "CONFIRMADO"


def test_historico_retorna_lista_vazia_quando_periodo_sem_doses(client, headers_a):
    _criar_agendamento(client, headers_a, MED_A)
    client.get("/api/doses/hoje", headers=headers_a)

    inicio = (datetime.now(FUSO) - timedelta(days=10)).strftime("%Y-%m-%d")
    fim = (datetime.now(FUSO) - timedelta(days=9)).strftime("%Y-%m-%d")
    r = client.get(f"/api/doses/historico?data_inicio={inicio}&data_fim={fim}", headers=headers_a)

    assert r.status_code == 200
    assert r.json() == []


def test_historico_nao_vaza_doses_de_outro_usuario(client, headers_a, headers_b):
    _criar_agendamento(client, headers_a, MED_A)
    client.get("/api/doses/hoje", headers=headers_a)

    r = client.get(f"/api/doses/historico?{_periodo_hoje()}", headers=headers_b)

    assert r.status_code == 200
    assert r.json() == []


def test_historico_ordena_por_horario_previsto_decrescente(client, headers_a):
    _criar_agendamento(client, headers_a, MED_A, horario="08:00")
    _criar_agendamento(client, headers_a, MED_B, horario="20:00")
    client.get("/api/doses/hoje", headers=headers_a)

    r = client.get(f"/api/doses/historico?{_periodo_hoje()}", headers=headers_a)

    assert r.status_code == 200
    horarios = [item["horario_previsto"] for item in r.json()]
    assert horarios == sorted(horarios, reverse=True)


def test_historico_rejeita_data_inicio_maior_que_data_fim(client, headers_a):
    r = client.get(
        "/api/doses/historico?data_inicio=2026-05-31&data_fim=2026-05-01",
        headers=headers_a,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "data_inicio não pode ser maior que data_fim"


def test_historico_rejeita_data_invalida(client, headers_a):
    r = client.get(
        "/api/doses/historico?data_inicio=data-invalida&data_fim=2026-05-01",
        headers=headers_a,
    )

    assert r.status_code == 422
