from datetime import datetime
from zoneinfo import ZoneInfo

MED = {"nome": "Rivotril", "dosagem": "2mg", "observacao": ""}
FUSO = ZoneInfo("America/Sao_Paulo")


def _hoje():
    return datetime.now(FUSO).strftime("%Y-%m-%d")


def _criar_medicamento(client, headers):
    return client.post("/api/medicamentos", json=MED, headers=headers).json()["id"]


def _criar_agendamento(client, headers, med_id):
    payload = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "diario",
        "dias_semana": None,
        "horarios": ["09:00"],
        "data_inicio": _hoje(),
    }
    return client.post("/api/agendamentos", json=payload, headers=headers).json()["id"]


def test_deletar_agendamento(client, headers_a):
    med_id = _criar_medicamento(client, headers_a)
    agend_id = _criar_agendamento(client, headers_a, med_id)

    r = client.delete(f"/api/agendamentos/{agend_id}", headers=headers_a)

    assert r.status_code == 200
    r2 = client.get(f"/api/agendamentos/{agend_id}", headers=headers_a)
    assert r2.status_code == 404


def test_cria_agendamento_com_horarios_ordenados(client, headers_a):
    med_id = _criar_medicamento(client, headers_a)
    payload = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "diario",
        "dias_semana": None,
        "horarios": ["22:10", "10:10"],
        "data_inicio": _hoje(),
    }

    response = client.post("/api/agendamentos", json=payload, headers=headers_a)

    assert response.status_code == 201
    body = response.json()
    assert body["tipo_recorrencia"] == "diario"
    assert body["dias_semana"] is None
    assert body["horarios"] == ["10:10", "22:10"]


def test_rejeita_horarios_duplicados(client, headers_a):
    med_id = _criar_medicamento(client, headers_a)
    payload = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "diario",
        "dias_semana": None,
        "horarios": ["10:10", "10:10"],
        "data_inicio": _hoje(),
    }

    response = client.post("/api/agendamentos", json=payload, headers=headers_a)

    assert response.status_code == 422


def test_rejeita_horario_fora_do_intervalo_valido(client, headers_a):
    med_id = _criar_medicamento(client, headers_a)
    payload = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "diario",
        "dias_semana": None,
        "horarios": ["24:00"],
        "data_inicio": _hoje(),
    }

    response = client.post("/api/agendamentos", json=payload, headers=headers_a)

    assert response.status_code == 422


def test_rejeita_dias_semana_invalidos(client, headers_a):
    med_id = _criar_medicamento(client, headers_a)
    payload = {
        "id_medicamento": med_id,
        "tipo_recorrencia": "dias_semana",
        "dias_semana": [1, 1, 7],
        "horarios": ["08:00"],
        "data_inicio": _hoje(),
    }

    response = client.post("/api/agendamentos", json=payload, headers=headers_a)

    assert response.status_code == 422


def test_nao_deleta_agendamento_com_confirmacao_vinculada(client, headers_a):
    med_id = _criar_medicamento(client, headers_a)
    agend_id = _criar_agendamento(client, headers_a, med_id)
    payload = {
        "id_agendamento": agend_id,
        "data_hora_prevista": f"{_hoje()} 09:00:00",
        "status": "PENDENTE",
    }
    confirmacao = client.post("/api/confirmacoes", json=payload, headers=headers_a)
    assert confirmacao.status_code == 201

    r = client.delete(f"/api/agendamentos/{agend_id}", headers=headers_a)

    assert r.status_code == 200

    confirmacao_atualizada = client.get(f"/api/confirmacoes/{confirmacao.json()['id']}", headers=headers_a)
    assert confirmacao_atualizada.status_code == 200
    assert confirmacao_atualizada.json()["status"] == "CANCELADO"


def test_delete_repetido_e_idempotente(client, headers_a):
    med_id = _criar_medicamento(client, headers_a)
    agend_id = _criar_agendamento(client, headers_a, med_id)

    primeiro = client.delete(f"/api/agendamentos/{agend_id}", headers=headers_a)
    segundo = client.delete(f"/api/agendamentos/{agend_id}", headers=headers_a)

    assert primeiro.status_code == 200
    assert segundo.status_code == 200


def test_agendamento_inativo_some_da_listagem(client, headers_a):
    med_id = _criar_medicamento(client, headers_a)
    agend_id = _criar_agendamento(client, headers_a, med_id)

    client.delete(f"/api/agendamentos/{agend_id}", headers=headers_a)
    listagem = client.get("/api/agendamentos", headers=headers_a)

    assert listagem.status_code == 200
    assert all(item["id"] != agend_id for item in listagem.json())
