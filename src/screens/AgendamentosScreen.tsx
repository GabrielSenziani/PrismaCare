import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const DateTimePicker: any = Platform.OS !== 'web'
  ? require('@react-native-community/datetimepicker').default
  : null;
import { colors as defaultColors, ColorPalette } from '../theme/colors';
import { useColors } from '../contexts/AccessibilityContext';
import PrimaryButton from '../components/PrimaryButton';
import { api } from '../services/api';
import { syncCurrentDoseReminders } from '../services/doseReminderSync';

type TipoRecorrencia = 'diario' | 'dias_semana';

type Agendamento = {
  id: number;
  id_medicamento: number;
  tipo_recorrencia: TipoRecorrencia;
  dias_semana: number[] | null;
  horarios: string[];
  data_inicio: string;
  data_fim?: string | null;
  ativo: boolean;
};

type Medicamento = { id: number; nome: string; dosagem: string };

const DIAS_SEMANA = [
  { value: 0, short: 'Dom', label: 'Domingo' },
  { value: 1, short: 'Seg', label: 'Segunda' },
  { value: 2, short: 'Ter', label: 'Terça' },
  { value: 3, short: 'Qua', label: 'Quarta' },
  { value: 4, short: 'Qui', label: 'Quinta' },
  { value: 5, short: 'Sex', label: 'Sexta' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
] as const;

const webDateInputStyle = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 15,
  borderRadius: 16,
  border: `1.5px solid ${defaultColors.border}`,
  backgroundColor: defaultColors.surface,
  color: defaultColors.textPrimary,
  marginBottom: 18,
  fontFamily: 'inherit',
} as any;

const webTimeInputStyle = {
  ...webDateInputStyle,
  marginBottom: 0,
} as any;

function sortHorarios(horarios: string[]) {
  return [...horarios].sort((a, b) => a.localeCompare(b));
}

function sortDiasSemana(dias: number[]) {
  return [...dias].sort((a, b) => a - b);
}

function proximoHorarioDisponivel(horariosAtuais: string[]) {
  for (let hour = 8; hour < 24; hour += 1) {
    const candidato = `${String(hour).padStart(2, '0')}:00`;
    if (!horariosAtuais.includes(candidato)) {
      return candidato;
    }
  }
  return '23:59';
}

function formatarResumoRecorrencia(agendamento: Agendamento) {
  const vezes = `${agendamento.horarios.length}x ao dia`;
  if (agendamento.tipo_recorrencia === 'diario') {
    return `Diário · ${vezes}`;
  }
  const dias = (agendamento.dias_semana ?? [])
    .map((dia) => DIAS_SEMANA.find((item) => item.value === dia)?.short)
    .filter(Boolean)
    .join(', ');
  return `${dias} · ${vezes}`;
}

function formatarHorario(date: Date) {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatarDataExibicao(valor?: string | null) {
  if (!valor) return '—';
  const [ano, mes, dia] = valor.split('-');
  if (!ano || !mes || !dia) return valor;
  return `${dia}/${mes}/${ano}`;
}

function horarioParaDate(valor: string) {
  const [hour, minute] = valor.split(':').map((part) => Number(part));
  const base = new Date();
  base.setSeconds(0, 0);
  base.setHours(Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0);
  return base;
}

export default function AgendamentosScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [lista, setLista] = useState<Agendamento[]>([]);
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editando, setEditando] = useState<Agendamento | null>(null);
  const [medSelecionado, setMedSelecionado] = useState<Medicamento | null>(null);
  const [tipoRecorrencia, setTipoRecorrencia] = useState<TipoRecorrencia>('diario');
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [horarios, setHorarios] = useState<string[]>(['08:00']);
  const [dataInicio, setDataInicio] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerIndex, setTimePickerIndex] = useState<number | null>(null);

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
    setTipoRecorrencia(a.tipo_recorrencia);
    setDiasSemana(sortDiasSemana(a.dias_semana ?? []));
    setHorarios(sortHorarios(a.horarios));
    setDataInicio(new Date(a.data_inicio + 'T12:00:00'));
    setShowForm(true);
  }

  function fecharForm() {
    setShowForm(false);
    setEditando(null);
    setMedSelecionado(null);
    setTipoRecorrencia('diario');
    setDiasSemana([]);
    setHorarios(['08:00']);
    setDataInicio(new Date());
    setShowDatePicker(false);
    setShowTimePicker(false);
    setTimePickerIndex(null);
  }

  function formatarData(d: Date) {
    return d.toISOString().split('T')[0];
  }

  function toggleDiaSemana(dia: number) {
    setDiasSemana((current) => {
      if (current.includes(dia)) {
        return current.filter((item) => item !== dia);
      }
      return [...current, dia].sort((a, b) => a - b);
    });
  }

  function adicionarHorario(valor = '08:00') {
    setHorarios((current) => sortHorarios([...current, valor]));
  }

  function atualizarHorario(index: number, valor: string) {
    const normalized = valor.trim();
    if (!normalized) return;
    setHorarios((current) => {
      const next = [...current];
      next[index] = normalized;
      return sortHorarios(next);
    });
  }

  function removerHorario(index: number) {
    setHorarios((current) => {
      if (current.length === 1) return current;
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function validarAntesDeSalvar() {
    if (!medSelecionado) {
      Alert.alert('Atenção', 'Selecione um medicamento.');
      return false;
    }
    if (horarios.length === 0) {
      Alert.alert('Atenção', 'Adicione pelo menos um horário.');
      return false;
    }
    if (new Set(horarios).size !== horarios.length) {
      Alert.alert('Atenção', 'Não repita horários no mesmo agendamento.');
      return false;
    }
    if (tipoRecorrencia === 'dias_semana' && diasSemana.length === 0) {
      Alert.alert('Atenção', 'Selecione pelo menos um dia da semana.');
      return false;
    }
    return true;
  }

  async function salvar() {
    if (!validarAntesDeSalvar()) {
      return;
    }

    const payload = {
      id_medicamento: medSelecionado!.id,
      tipo_recorrencia: tipoRecorrencia,
      dias_semana: tipoRecorrencia === 'dias_semana' ? diasSemana : null,
      horarios: sortHorarios(horarios),
      data_inicio: formatarData(dataInicio),
      ativo: true,
    };

    setSaving(true);
    try {
      if (editando) {
        await api(`/api/agendamentos/${editando.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/api/agendamentos', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      fecharForm();
      await buscar();
      await syncCurrentDoseReminders();
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
      await syncCurrentDoseReminders();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setDeletingId(null);
    }
  }

  function abrirTimePicker(index: number) {
    setTimePickerIndex(index);
    setShowTimePicker(true);
  }

  function adicionarOuAtualizarHorarioSelecionado(date?: Date) {
    setShowTimePicker(false);
    if (!date || timePickerIndex === null) return;

    const valor = formatarHorario(date);
    if (horarios.includes(valor) && horarios[timePickerIndex] !== valor) {
      Alert.alert('Atenção', 'Esse horário já foi adicionado.');
      return;
    }

    if (timePickerIndex >= horarios.length) {
      adicionarHorario(valor);
    } else {
      atualizarHorario(timePickerIndex, valor);
    }
    setTimePickerIndex(null);
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
              <Text style={styles.cardSub}>{formatarResumoRecorrencia(item)}</Text>
              <Text style={styles.cardMuted}>{item.horarios.join(' · ')}</Text>
              <Text style={styles.cardMuted}>
                Início: {formatarDataExibicao(item.data_inicio)}
                {item.data_fim ? ` · Fim: ${formatarDataExibicao(item.data_fim)}` : ''}
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

              <Text style={styles.selectorLabel}>MEDICAMENTO</Text>
              {medicamentos.length === 0 ? (
                <Text style={styles.selectorVazio}>Nenhum medicamento cadastrado. Cadastre um primeiro.</Text>
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
                        <Ionicons name="medkit-outline" size={14} color={selecionado ? colors.white : colors.primary} />
                        <Text style={[styles.selectorChipText, selecionado && styles.selectorChipTextAtivo]}>{m.nome}</Text>
                        <Text style={[styles.selectorChipDose, selecionado && { color: 'rgba(255,255,255,0.75)' }]}>{m.dosagem}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <Text style={styles.selectorLabel}>RECORRÊNCIA</Text>
              <View style={styles.optionRow}>
                <TouchableOpacity
                  style={[styles.optionChip, tipoRecorrencia === 'diario' && styles.optionChipAtivo]}
                  onPress={() => {
                    setTipoRecorrencia('diario');
                    setDiasSemana([]);
                  }}
                >
                  <Text style={[styles.optionChipText, tipoRecorrencia === 'diario' && styles.optionChipTextAtivo]}>
                    Todos os dias
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionChip, tipoRecorrencia === 'dias_semana' && styles.optionChipAtivo]}
                  onPress={() => setTipoRecorrencia('dias_semana')}
                >
                  <Text style={[styles.optionChipText, tipoRecorrencia === 'dias_semana' && styles.optionChipTextAtivo]}>
                    Dias específicos
                  </Text>
                </TouchableOpacity>
              </View>

              {tipoRecorrencia === 'dias_semana' ? (
                <>
                  <Text style={styles.selectorLabel}>DIAS DA SEMANA</Text>
                  <View style={styles.weekdayRow}>
                    {DIAS_SEMANA.map((dia) => {
                      const selecionado = diasSemana.includes(dia.value);
                      return (
                        <TouchableOpacity
                          key={dia.value}
                          style={[styles.weekdayChip, selecionado && styles.weekdayChipAtivo]}
                          onPress={() => toggleDiaSemana(dia.value)}
                        >
                          <Text style={[styles.weekdayChipText, selecionado && styles.weekdayChipTextAtivo]}>
                            {dia.short}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text style={styles.selectorLabel}>HORÁRIOS</Text>
              <View style={styles.timeList}>
                {horarios.map((item, index) => (
                  <View key={`${item}-${index}`} style={styles.timeRow}>
                    {Platform.OS === 'web' ? (
                      // @ts-ignore
                      <input
                        type="time"
                        value={item}
                        onChange={(e: any) => atualizarHorario(index, e.target.value)}
                        style={webTimeInputStyle}
                      />
                    ) : (
                      <TouchableOpacity style={styles.timeButton} onPress={() => abrirTimePicker(index)}>
                        <Ionicons name="time-outline" size={18} color={colors.primary} />
                        <Text style={styles.timeButtonText}>{item}</Text>
                        <Ionicons name="chevron-down-outline" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.removeTimeButton, horarios.length === 1 && styles.removeTimeButtonDisabled]}
                      onPress={() => removerHorario(index)}
                      disabled={horarios.length === 1}
                    >
                      <Ionicons
                        name="remove-circle-outline"
                        size={20}
                        color={horarios.length === 1 ? colors.textMuted : colors.error}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={styles.addTimeButton}
                onPress={() => {
                  if (Platform.OS === 'web') {
                    adicionarHorario(proximoHorarioDisponivel(horarios));
                    return;
                  }
                  abrirTimePicker(horarios.length);
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.addTimeButtonText}>Adicionar horário</Text>
              </TouchableOpacity>

              <Text style={styles.selectorLabel}>DATA DE INÍCIO</Text>
              {Platform.OS === 'web' ? (
                // @ts-ignore
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
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                    <Text style={styles.dateBtnText}>{dataInicio.toLocaleDateString('pt-BR')}</Text>
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

              {showTimePicker && Platform.OS !== 'web' ? (
                <DateTimePicker
                  value={timePickerIndex !== null && timePickerIndex < horarios.length ? horarioParaDate(horarios[timePickerIndex]) : new Date()}
                  mode="time"
                  display="default"
                  onChange={(_e: unknown, date?: Date) => adicionarOuAtualizarHorarioSelecionado(date)}
                />
              ) : null}

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
          <Ionicons name="add" size={26} color={colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 110, gap: 12 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  cardSub: { marginTop: 4, fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  cardMuted: { marginTop: 4, fontSize: 13, color: colors.textMuted },
  ativoTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  actions: { gap: 8 },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    marginTop: 12,
    padding: 18,
    borderRadius: 22,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  formTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 18 },
  selectorLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  selectorVazio: { color: colors.textMuted, marginBottom: 18 },
  selectorScroll: { marginBottom: 18 },
  selectorRow: { gap: 10, paddingRight: 6 },
  selectorChip: {
    minWidth: 120,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  selectorChipAtivo: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectorChipText: { marginTop: 6, fontWeight: '700', color: colors.textPrimary },
  selectorChipTextAtivo: { color: colors.white },
  selectorChipDose: { marginTop: 2, fontSize: 12, color: colors.textMuted },
  optionRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  optionChip: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  optionChipAtivo: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionChipText: { fontWeight: '700', color: colors.textSecondary },
  optionChipTextAtivo: { color: colors.primaryDeep },
  weekdayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  weekdayChip: {
    width: 46,
    height: 42,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayChipAtivo: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekdayChipText: { fontWeight: '700', color: colors.textSecondary },
  weekdayChipTextAtivo: { color: colors.white },
  timeList: { gap: 10, marginBottom: 12 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeButtonText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  removeTimeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeTimeButtonDisabled: { opacity: 0.45 },
  addTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginBottom: 18,
  },
  addTimeButtonText: { color: colors.primary, fontWeight: '700' },
  dateBtn: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateBtnText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  formButtons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: colors.textSecondary, fontWeight: '700' },
  saveBtn: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
});
