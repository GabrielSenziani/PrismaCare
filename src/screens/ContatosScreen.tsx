import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useColors, useAccessibility } from '../contexts/AccessibilityContext';
import InputField from '../components/InputField';
import PrimaryButton from '../components/PrimaryButton';
import AppText from '../components/AppText';
import { useToast } from '../components/Toast';
import { triggerHaptic } from '../utils/haptics';
import { api } from '../services/api';

type Contato = { id: number; nome: string; telefone: string; parentesco: string; ativo: boolean };

export default function ContatosScreen() {
  const colors = useColors();
  const { hapticsEnabled } = useAccessibility();
  const toast = useToast();
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
        toast.show('Contato atualizado', 'success');
      } else {
        await api('/api/contatos', {
          method: 'POST',
          body: JSON.stringify({ nome: nome.trim(), telefone: telefone.trim(), parentesco: parentesco.trim() }),
        });
        toast.show('Contato cadastrado', 'success');
      }
      triggerHaptic('success', hapticsEnabled);
      fecharForm();
      await buscar();
    } catch (e: any) {
      triggerHaptic('error', hapticsEnabled);
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
      if (editando?.id === contatoId) fecharForm();
      toast.show('Contato removido', 'success');
      await buscar();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={lista}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <AppText variant="body" color={colors.textMuted} style={styles.empty}>
            Nenhum contato cadastrado.
          </AppText>
        }
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeIn.delay(index * 40).duration(260)}
            style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}
          >
            <View style={[styles.cardIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="person-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.cardInfo}>
              <AppText variant="bodyStrong" color={colors.textPrimary}>{item.nome}</AppText>
              <AppText variant="caption" color={colors.textSecondary} style={{ marginTop: 2 }}>
                {item.telefone} · {item.parentesco}
              </AppText>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primarySoft }]}
                onPress={() => {
                  triggerHaptic('light', hapticsEnabled);
                  abrirEditar(item);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${item.nome}`}
              >
                <Ionicons name="pencil-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.errorBg }]}
                onPress={() => confirmarExclusao(item)}
                disabled={deletingId === item.id}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={`Excluir ${item.nome}`}
              >
                {deletingId === item.id ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Ionicons name="trash-outline" size={22} color={colors.error} />
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
        ListFooterComponent={
          showForm ? (
            <Animated.View
              entering={FadeIn.duration(220)}
              style={[styles.form, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}
            >
              <AppText variant="heading" color={colors.textPrimary} style={{ marginBottom: 16 }}>
                {editando ? 'Editar Contato' : 'Novo Contato'}
              </AppText>
              <InputField label="Nome" iconName="person-outline" placeholder="Nome completo" value={nome} onChangeText={setNome} />
              <InputField label="Telefone" iconName="call-outline" placeholder="(11) 99999-9999" value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" />
              <InputField label="Parentesco" iconName="heart-outline" placeholder="Ex: Filho, Cônjuge" value={parentesco} onChangeText={setParentesco} />
              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={fecharForm}
                  accessibilityRole="button"
                  accessibilityLabel="Cancelar"
                >
                  <AppText variant="bodyStrong" color={colors.textSecondary}>Cancelar</AppText>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title={editando ? 'Atualizar' : 'Salvar'} onPress={salvar} loading={saving} />
                </View>
              </View>
            </Animated.View>
          ) : null
        }
      />
      {!showForm && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary, shadowColor: colors.primaryDeep }]}
          onPress={() => {
            triggerHaptic('light', hapticsEnabled);
            setEditando(null);
            setShowForm(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Cadastrar novo contato"
        >
          <Ionicons name="add" size={32} color={colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  empty: { textAlign: 'center', marginTop: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1, marginRight: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    borderRadius: 20,
    padding: 20,
    marginTop: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  formButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
});
