import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// DateTimePicker não suporta web — importar apenas em native
const DateTimePicker: any = Platform.OS !== 'web'
  ? require('@react-native-community/datetimepicker').default
  : null;
import { colors } from '../theme/colors';
import InputField from '../components/InputField';
import PrimaryButton from '../components/PrimaryButton';
import { api } from '../services/api';

type Agendamento = {
  id: number;
  id_medicamento: number;
  horario: string;
  frequencia: string;
  data_inicio: string;
  data_fim?: string;
  ativo: boolean;
};

type Medicamento = { id: number; nome: string; dosagem: string };

const webDateInputStyle = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 15,
  borderRadius: 16,
  border: `1.5px solid ${colors.border}`,
  backgroundColor: colors.surface,
  color: colors.textPrimary,
  marginBottom: 18,
  fontFamily: 'inherit',
} as any;

const webTimeInputStyle = {
  ...webDateInputStyle,
} as any;

export default function AgendamentosScreen() {
  const [lista, setLista] = useState<Agendamento[]>([]);
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editando, setEditando] = useState<Agendamento | null>(null);
  const [medSelecionado, setMedSelecionado] = useState<Medicamento | null>(null);
  const [horario, setHorario] = useState('');
  const [frequencia, setFrequencia] = useState('');
  const [dataInicio, setDataInicio] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const buscar = useCallback(async () => {
    try {
      const [agendamentos, meds] = await Promise.all([
        api<Agendamento[]>('/api/agendamentos'),
        api<Medicamento[]>('/api/medicamentos'),
      ]);
      setLista(agendamentos);
      setMedicamentos(meds);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  function nomeMedicamento(id: number) {
    return medicamentos.find((m) => m.id === id)?.nome ?? `#${id}`;
  }

  function abrirEditar(a: Agendamento) {
    setEditando(a);
    setMedSelecionado(medicamentos.find((m) => m.id === a.id_medicamento) ?? null);
    setHorario(a.horario);
    setFrequencia(a.frequencia);
    setDataInicio(new Date(a.data_inicio + 'T12:00:00'));
    setShowForm(true);
  }

  function fecharForm() {
    setShowForm(false);
    setEditando(null);
    setMedSelecionado(null);
    setHorario(''); setFrequencia('');
    setDataInicio(new Date());
    setShowDatePicker(false);
    setShowTimePicker(false);
  }

  function formatarData(d: Date) {
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  function formatarHorario(date: Date) {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function horarioParaDate(valor: string) {
    const [hour, minute] = valor.split(':').map((part) => Number(part));
    const base = new Date();
    base.setSeconds(0, 0);
    base.setHours(Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0);
    return base;
  }

  function onChangeHorario(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) {
      setHorario(digits);
      return;
    }
    setHorario(`${digits.slice(0, 2)}:${digits.slice(2)}`);
  }

  async function salvar() {
    if (!medSelecionado || !horario.trim() || !frequencia.trim()) {
      Alert.alert('Atenção', 'Preencha todos os campos obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      if (editando) {
        await api(`/api/agendamentos/${editando.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            id_medicamento: medSelecionado.id,
            horario: horario.trim(),
            frequencia: frequencia.trim(),
            data_inicio: formatarData(dataInicio),
          }),
        });
      } else {
        await api('/api/agendamentos', {
          method: 'POST',
          body: JSON.stringify({
            id_medicamento: medSelecionado.id,
            horario: horario.trim(),
            frequencia: frequencia.trim(),
            data_inicio: formatarData(dataInicio),
          }),
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

  function confirmarExclusao(agendamento: Agendamento) {
    Alert.alert(
      'Excluir agendamento',
      `Deseja remover o agendamento de ${nomeMedicamento(agendamento.id_medicamento)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => excluir(agendamento.id),
        },
      ],
    );
  }

  async function excluir(agendamentoId: number) {
    setDeletingId(agendamentoId);
    try {
      await api(`/api/agendamentos/${agendamentoId}`, { method: 'DELETE' });
      if (editando?.id === agendamentoId) {
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
        ListEmptyComponent={<Text style={styles.empty}>Nenhum agendamento cadastrado.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{nomeMedicamento(item.id_medicamento)}</Text>
              <Text style={styles.cardSub}>{item.horario} · {item.frequencia}</Text>
              <Text style={styles.cardMuted}>
                Início: {item.data_inicio}{item.data_fim ? ` · Fim: ${item.data_fim}` : ''}
              </Text>
            </View>
            <View style={[styles.ativoTag, { backgroundColor: item.ativo ? colors.primaryLight : '#F3F4F6' }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: item.ativo ? colors.primary : colors.textMuted }}>
                {item.ativo ? 'Ativo' : 'Inativo'}
              </Text>
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
              <Text style={styles.formTitle}>{editando ? 'Editar Agendamento' : 'Novo Agendamento'}</Text>

              {/* Seletor de medicamento */}
              <Text style={styles.selectorLabel}>MEDICAMENTO</Text>
              {medicamentos.length === 0 ? (
                <Text style={styles.selectorVazio}>
                  Nenhum medicamento cadastrado. Cadastre um primeiro.
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.selectorScroll}
                  contentContainerStyle={styles.selectorRow}
                >
                  {medicamentos.map((m) => {
                    const selecionado = medSelecionado?.id === m.id;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.selectorChip, selecionado && styles.selectorChipAtivo]}
                        onPress={() => setMedSelecionado(m)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="medkit-outline"
                          size={14}
                          color={selecionado ? colors.white : colors.primary}
                        />
                        <Text style={[styles.selectorChipText, selecionado && styles.selectorChipTextAtivo]}>
                          {m.nome}
                        </Text>
                        <Text style={[styles.selectorChipDose, selecionado && { color: 'rgba(255,255,255,0.75)' }]}>
                          {m.dosagem}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <InputField
                label="Frequência"
                iconName="repeat-outline"
                placeholder="Ex: diário, 2x ao dia"
                value={frequencia}
                onChangeText={setFrequencia}
              />
              <Text style={styles.selectorLabel}>HORÁRIO</Text>
              {Platform.OS === 'web' ? (
                // @ts-ignore — React Native Web permite elementos HTML nativos
                <input
                  type="time"
                  value={horario}
                  onChange={(e: any) => onChangeHorario(e.target.value)}
                  style={webTimeInputStyle}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.dateBtn}
                    onPress={() => setShowTimePicker(true)}
                  >
                    <Ionicons name="time-outline" size={18} color={colors.primary} />
                    <Text style={styles.dateBtnText}>
                      {horario || 'Selecionar horário'}
                    </Text>
                    <Ionicons name="chevron-down-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  {showTimePicker && (
                    <DateTimePicker
                      value={horario ? horarioParaDate(horario) : new Date()}
                      mode="time"
                      display="default"
                      onChange={(_e: unknown, date?: Date) => {
                        setShowTimePicker(false);
                        if (date) setHorario(formatarHorario(date));
                      }}
                    />
                  )}
                </>
              )}
              {/* Seletor de data */}
              <Text style={styles.selectorLabel}>DATA DE INÍCIO</Text>
              {Platform.OS === 'web' ? (
                // @ts-ignore — React Native Web permite elementos HTML nativos
                <input
                  type="date"
                  value={formatarData(dataInicio)}
                  onChange={(e: any) => {
                    const d = new Date(e.target.value + 'T12:00:00');
                    if (!isNaN(d.getTime())) setDataInicio(d);
                  }}
                  style={webDateInputStyle}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.dateBtn}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                    <Text style={styles.dateBtnText}>
                      {dataInicio.toLocaleDateString('pt-BR')}
                    </Text>
                    <Ionicons name="chevron-down-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={dataInicio}
                      mode="date"
                      display="default"
                      onChange={(_e: unknown, date?: Date) => {
                        setShowDatePicker(false);
                        if (date) setDataInicio(date);
                      }}
                    />
                  )}
                </>
              )}

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
  ativoTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  actions: { flexDirection: 'row', gap: 8, marginLeft: 8 },
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
  selectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  selectorVazio: { fontSize: 13, color: colors.textMuted, marginBottom: 18 },
  selectorScroll: { marginBottom: 18 },
  selectorRow: { gap: 8, paddingBottom: 4 },
  selectorChip: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
    minWidth: 100,
  },
  selectorChipAtivo: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectorChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  selectorChipTextAtivo: { color: colors.white },
  selectorChipDose: {
    fontSize: 11,
    color: colors.textMuted,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 18,
  },
  dateBtnText: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
  },
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
