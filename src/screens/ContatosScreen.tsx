import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import InputField from '../components/InputField';
import PrimaryButton from '../components/PrimaryButton';
import { api } from '../services/api';

type Contato = { id: number; nome: string; telefone: string; parentesco: string; ativo: boolean };

export default function ContatosScreen() {
  const [lista, setLista] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Contato | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [parentesco, setParentesco] = useState('');

  const buscar = useCallback(async () => {
    try {
      const data = await api<Contato[]>('/api/contatos');
      setLista(data);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  function abrirEditar(c: Contato) {
    setEditando(c);
    setNome(c.nome);
    setTelefone(c.telefone);
    setParentesco(c.parentesco);
    setShowForm(true);
  }

  function fecharForm() {
    setShowForm(false);
    setEditando(null);
    setNome(''); setTelefone(''); setParentesco('');
  }

  async function salvar() {
    if (!nome.trim() || !telefone.trim() || !parentesco.trim()) {
      Alert.alert('Atenção', 'Todos os campos são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      if (editando) {
        await api(`/api/contatos/${editando.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ nome: nome.trim(), telefone: telefone.trim(), parentesco: parentesco.trim() }),
        });
      } else {
        await api('/api/contatos', {
          method: 'POST',
          body: JSON.stringify({ nome: nome.trim(), telefone: telefone.trim(), parentesco: parentesco.trim() }),
        });
      }
      fecharForm();
      await buscar();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmarExclusao(contato: Contato) {
    Alert.alert(
      'Excluir contato',
      `Deseja remover ${contato.nome}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => excluir(contato.id),
        },
      ],
    );
  }

  async function excluir(contatoId: number) {
    setDeletingId(contatoId);
    try {
      await api(`/api/contatos/${contatoId}`, { method: 'DELETE' });
      if (editando?.id === contatoId) {
        fecharForm();
      }
      await buscar();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <ActivityIndicator style={styles.center} color={colors.primary} size="large" />;

  return (
    <View style={styles.container}>
      <FlatList
        data={lista}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum contato cadastrado.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons name="person-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{item.nome}</Text>
              <Text style={styles.cardSub}>{item.telefone} · {item.parentesco}</Text>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => abrirEditar(item)}>
                <Ionicons name="pencil-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => confirmarExclusao(item)}
                disabled={deletingId === item.id}
              >
                {deletingId === item.id ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListFooterComponent={
          showForm ? (
            <View style={styles.form}>
              <Text style={styles.formTitle}>{editando ? 'Editar Contato' : 'Novo Contato'}</Text>
              <InputField label="Nome" iconName="person-outline" placeholder="Nome completo" value={nome} onChangeText={setNome} />
              <InputField label="Telefone" iconName="call-outline" placeholder="(11) 99999-9999" value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" />
              <InputField label="Parentesco" iconName="heart-outline" placeholder="Ex: Filho, Cônjuge" value={parentesco} onChangeText={setParentesco} />
              <View style={styles.formButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={fecharForm}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
                <PrimaryButton
                  title={editando ? 'Atualizar' : 'Salvar'}
                  onPress={salvar}
                  loading={saving}
                  style={styles.saveBtn}
                />
              </View>
            </View>
          ) : null
        }
      />
      {!showForm && (
        <TouchableOpacity style={styles.fab} onPress={() => { setEditando(null); setShowForm(true); }}>
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 80 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, fontSize: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  cardSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  editBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.errorBg,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    marginTop: 8,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  formButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 1 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
});
