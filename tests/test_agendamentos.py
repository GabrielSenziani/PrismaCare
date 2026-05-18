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
        "horario": "09:00",
        "frequencia": "diario",
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

    assert r.status_code == 409
    assert "registros vinculados" in r.text
