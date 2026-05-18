import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { api } from '../services/api';
import { DoseReminderInput, syncDoseReminders } from '../services/notificationService';
import PrimaryButton from '../components/PrimaryButton';
import { RootStackParamList } from '../../App';

type Dose = DoseReminderInput & {
  confirmacao_id: number;
  horario_previsto: string;
  horario_confirmacao: string | null;
  status: 'PENDENTE' | 'CONFIRMADO' | 'ATRASADO' | 'CANCELADO' | 'NAO_CONFIRMADO';
  medicamento: { nome: string; dosagem: string; observacao?: string };
};

const STATUS_CONFIG = {
  PENDENTE:       { label: 'Pendente',       color: '#F59E0B', bg: '#FEF3C7' },
  CONFIRMADO:     { label: 'Confirmado',     color: '#10B981', bg: '#D1FAE5' },
  ATRASADO:       { label: 'Atrasado',       color: '#EF4444', bg: '#FEE2E2' },
  CANCELADO:      { label: 'Cancelado',      color: '#6B7280', bg: '#F3F4F6' },
  NAO_CONFIRMADO: { label: 'Não Confirmado', color: '#7F1D1D', bg: '#FEE2E2' }, // Tom vermelho escuro/vencido
};

type Props = NativeStackScreenProps<RootStackParamList, 'Doses'>;

function canConfirmDose(status: Dose['status']) {
  return status === 'PENDENTE' || status === 'NAO_CONFIRMADO';
}

function confirmLabelForStatus(status: Dose['status']) {
  return status === 'NAO_CONFIRMADO' ? 'Confirmar mesmo assim' : 'Confirmar tomada';
}

export default function DosesScreen({ navigation, route }: Props) {
  const [doses, setDoses] = useState<Dose[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [modalConfirmacaoId, setModalConfirmacaoId] = useState<number | null>(null);
  const lastHandledNotificationConfirmacaoIdRef = useRef<number | null>(null);

  const buscar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Dose[]>('/api/doses/hoje');
      setDoses(data);
      await syncDoseReminders(data);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      buscar();
    }, [buscar]),
  );

  useEffect(() => {
    if (route.params?.confirmacaoId === undefined) {
      lastHandledNotificationConfirmacaoIdRef.current = null;
    }
  }, [route.params?.confirmacaoId]);

  const modalDose = useMemo(
    () => doses.find((item) => item.confirmacao_id === modalConfirmacaoId) ?? null,
    [doses, modalConfirmacaoId],
  );

  useEffect(() => {
    const confirmacaoId = route.params?.confirmacaoId;
    if (!confirmacaoId || loading) {
      return;
    }

    if (lastHandledNotificationConfirmacaoIdRef.current === confirmacaoId) {
      return;
    }

    lastHandledNotificationConfirmacaoIdRef.current = confirmacaoId;

    const encontrada = doses.find((item) => item.confirmacao_id === confirmacaoId);
    if (encontrada && canConfirmDose(encontrada.status)) {
      setModalConfirmacaoId(confirmacaoId);
    }

    navigation.setParams({ confirmacaoId: undefined });
  }, [doses, loading, navigation, route.params?.confirmacaoId]);

  async function confirmar(id: number) {
    setConfirming(id);
    try {
      await api(`/api/confirmacoes/${id}/confirmar`, { method: 'PUT' });
      setModalConfirmacaoId((current) => (current === id ? null : current));
      await buscar();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setConfirming(null);
    }
  }

  function fecharModal() {
    setModalConfirmacaoId(null);
  }

  if (loading) return <ActivityIndicator style={styles.center} color={colors.primary} size="large" />;

  return (
    <View style={styles.container}>
      <FlatList
        data={doses}
        keyExtractor={(item) => String(item.confirmacao_id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nenhuma dose programada para hoje.</Text>}
        renderItem={({ item }) => {
          const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.PENDENTE;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.medInfo}>
                  <Text style={styles.medNome}>{item.medicamento.nome}</Text>
                  <Text style={styles.medDosagem}>{item.medicamento.dosagem}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>

              <View style={styles.timeRow}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={styles.timeText}>
                  Previsto: {item.horario_previsto?.substring(11, 16) ?? '—'}
                </Text>
                {item.horario_confirmacao ? (
                  <Text style={styles.timeText}>
                    {'  '}Confirmado: {item.horario_confirmacao?.substring(11, 16)}
                  </Text>
                ) : null}
              </View>

              {canConfirmDose(item.status) && (
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={() => confirmar(item.confirmacao_id)}
                  disabled={confirming === item.confirmacao_id}
                >
                  {confirming === item.confirmacao_id ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color={colors.white} />
                      <Text style={styles.confirmText}>{confirmLabelForStatus(item.status)}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      <Modal
        visible={modalDose !== null}
        transparent
        animationType="fade"
        onRequestClose={fecharModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={fecharModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="checkmark-circle-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Confirmar tomada</Text>
            {modalDose ? (
              <>
                <Text style={styles.modalBody}>
                  Você tomou {modalDose.medicamento.nome} {modalDose.medicamento.dosagem} das{' '}
                  {modalDose.horario_previsto?.substring(11, 16) ?? '—'}?
                </Text>
                <PrimaryButton
                  title={confirmLabelForStatus(modalDose.status)}
                  onPress={() => confirmar(modalDose.confirmacao_id)}
                  loading={confirming === modalDose.confirmacao_id}
                  style={styles.modalPrimaryButton}
                />
              </>
            ) : null}
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={fecharModal}>
              <Text style={styles.modalSecondaryText}>Agora não</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, fontSize: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  medInfo: { flex: 1 },
  medNome: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  medDosagem: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginLeft: 8,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 4,
  },
  timeText: { fontSize: 12, color: colors.textMuted },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
  },
  confirmText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 18, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalBody: {
    marginTop: 10,
    marginBottom: 22,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  modalPrimaryButton: {
    marginBottom: 12,
  },
  modalSecondaryButton: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
