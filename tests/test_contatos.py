CONTATO_VALIDO = {
    "nome": "Cuidador",
    "telefone": "11988880000",
    "parentesco": "Filho",
}


def test_criar_contato_com_telefone_invalido_retorna_422(client, headers_a):
    payload = {
        **CONTATO_VALIDO,
        "telefone": "abc",
    }

    r = client.post("/api/contatos", json=payload, headers=headers_a)

    assert r.status_code == 422
    assert "telefone" in r.text.lower()


def test_deletar_contato(client, headers_a):
    contato_id = client.post("/api/contatos", json=CONTATO_VALIDO, headers=headers_a).json()["id"]

    r = client.delete(f"/api/contatos/{contato_id}", headers=headers_a)

    assert r.status_code == 200
    r2 = client.get(f"/api/contatos/{contato_id}", headers=headers_a)
    assert r2.status_code == 404


def test_nao_deleta_contato_com_notificacao_vinculada(client, headers_a):
    from tests.test_whatsapp_simulado import _criar_stack, _criar_confirmacao_vencida
    from app.services.monitor_service import varrer_e_notificar

    _med_id, contato_id, agend_id = _criar_stack(client, headers_a, contato=CONTATO_VALIDO)
    _criar_confirmacao_vencida(client, headers_a, agend_id)
    resultado = varrer_e_notificar()

    assert resultado["notificacoes_criadas"] == 1

    r = client.delete(f"/api/contatos/{contato_id}", headers=headers_a)

    assert r.status_code == 409
    assert "registros vinculados" in r.text
