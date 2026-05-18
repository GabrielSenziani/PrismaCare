from datetime import datetime
from zoneinfo import ZoneInfo

from tests.conftest import USUARIO_A, registrar_e_logar

MED = {"nome": "Rivotril", "dosagem": "2mg", "observacao": ""}
CONTATO = {"nome": "Contato", "telefone": "11977770000", "parentesco": "Cônjuge"}


def _hoje():
    return datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y-%m-%d")


def _criar_agendamento(client, headers, med_id):
    return client.post(
        "/api/agendamentos",
        json={
            "id_medicamento": med_id,
            "tipo_recorrencia": "diario",
            "dias_semana": None,
            "horarios": ["09:00"],
            "data_inicio": _hoje(),
        },
        headers=headers,
    ).json()["id"]


# ---------- Medicamentos ----------

def test_nao_ve_medicamentos_de_outro(client, headers_a, headers_b):
    client.post("/api/medicamentos", json=MED, headers=headers_a)
    r = client.get("/api/medicamentos", headers=headers_b)
    assert r.status_code == 200
    assert r.json() == []


# ---------- Doses ----------

def test_nao_ve_doses_de_outro(client, headers_a, headers_b):
    med_id = client.post("/api/medicamentos", json=MED, headers=headers_a).json()["id"]
    _criar_agendamento(client, headers_a, med_id)
    client.get("/api/doses/hoje", headers=headers_a)

    r = client.get("/api/doses/hoje", headers=headers_b)
    assert r.json() == []


# ---------- Confirmações ----------

def test_nao_confirma_dose_de_outro(client, headers_a, headers_b):
    med_id = client.post("/api/medicamentos", json=MED, headers=headers_a).json()["id"]
    _criar_agendamento(client, headers_a, med_id)
    doses = client.get("/api/doses/hoje", headers=headers_a).json()
    confirmacao_id = doses[0]["confirmacao_id"]

    r = client.put(f"/api/confirmacoes/{confirmacao_id}/confirmar", headers=headers_b)
    assert r.status_code == 403


# ---------- Agendamentos ----------

def test_nao_acessa_agendamento_de_outro(client, headers_a, headers_b):
    med_id = client.post("/api/medicamentos", json=MED, headers=headers_a).json()["id"]
    agend_id = _criar_agendamento(client, headers_a, med_id)

    r = client.get(f"/api/agendamentos/{agend_id}", headers=headers_b)
    assert r.status_code in (403, 404)


# ---------- Conta ----------

def test_nao_deleta_conta_de_outro(client, headers_b):
    # Obtém o ID do usuário A
    res = client.post("/api/users", json={**USUARIO_A, "email": "outro@teste.com",
                                          "telefone": "11955550000"})
    id_outro = res.json()["id"]

    r = client.delete(f"/api/users/{id_outro}", headers=headers_b)
    assert r.status_code == 403
