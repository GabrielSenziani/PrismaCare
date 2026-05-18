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

type Medicamento = { id: number; nome: string; dosagem: string; observacao?: string };

export default function MedicamentosScreen() {
  const [lista, setLista] = useState<Medicamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Medicamento | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [dosagem, setDosagem] = useState('');
  const [observacao, setObservacao] = useState('');

  const buscar = useCallback(async () => {
    try {
      const data = await api<Medicamento[]>('/api/medicamentos');
      setLista(data);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  function abrirEditar(m: Medicamento) {
    setEditando(m);
    setNome(m.nome);
    setDosagem(m.dosagem);
    setObservacao(m.observacao ?? '');
    setShowForm(true);
  }

  function fecharForm() {
    setShowForm(false);
    setEditando(null);
    setNome(''); setDosagem(''); setObservacao('');
  }

  async function salvar() {
    if (!nome.trim() || !dosagem.trim()) {
      Alert.alert('Atenção', 'Nome e dosagem são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      if (editando) {
        await api(`/api/medicamentos/${editando.id}`, {
          method: 'PUT',
          body: JSON.stringify({ nome: nome.trim(), dosagem: dosagem.trim(), observacao: observacao.trim() || undefined, ativo: true }),
        });
      } else {
        await api('/api/medicamentos', {
          method: 'POST',
          body: JSON.stringify({ nome: nome.trim(), dosagem: dosagem.trim(), observacao: observacao.trim() || undefined }),
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

  function confirmarExclusao(medicamento: Medicamento) {
    Alert.alert(
      'Excluir medicamento',
      `Deseja remover ${medicamento.nome}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => excluir(medicamento.id),
        },
      ],
    );
  }

  async function excluir(medicamentoId: number) {
    setDeletingId(medicamentoId);
    try {
      await api(`/api/medicamentos/${medicamentoId}`, { method: 'DELETE' });
      if (editando?.id === medicamentoId) {
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
        ListEmptyComponent={<Text style={styles.empty}>Nenhum medicamento cadastrado.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons name="medkit-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{item.nome}</Text>
              <Text style={styles.cardSub}>{item.dosagem}</Text>
              {item.observacao ? <Text style={styles.cardMuted}>{item.observacao}</Text> : null}
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
              <Text style={styles.formTitle}>{editando ? 'Editar Medicamento' : 'Novo Medicamento'}</Text>
              <InputField label="Nome" iconName="medkit-outline" placeholder="Ex: Losartana" value={nome} onChangeText={setNome} />
              <InputField label="Dosagem" iconName="flask-outline" placeholder="Ex: 50mg" value={dosagem} onChangeText={setDosagem} />
              <InputField label="Observação (opcional)" iconName="document-text-outline" placeholder="Ex: Tomar com água" value={observacao} onChangeText={setObservacao} />
              <View style={styles.formButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={fecharForm}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
                <PrimaryButton title={editando ? 'Atualizar' : 'Salvar'} onPress={salvar} loading={saving} style={styles.saveBtn} />
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
  cardMuted: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
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
