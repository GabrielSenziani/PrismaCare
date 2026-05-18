import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useColors, useAccessibility } from '../contexts/AccessibilityContext';
import { api } from '../services/api';
import { DoseReminderInput, syncDoseReminders } from '../services/notificationService';
import PrimaryButton from '../components/PrimaryButton';
import AppText from '../components/AppText';
import { useToast } from '../components/Toast';
import { triggerHaptic } from '../utils/haptics';
import { formatBusinessTime, formatConfirmationTime } from '../utils/dateTime';
import { RootStackParamList } from '../../App';

type Dose = DoseReminderInput & {
  confirmacao_id: number;
  horario_previsto: string;
  horario_confirmacao: string | null;
  status: 'PENDENTE' | 'CONFIRMADO' | 'ATRASADO' | 'CANCELADO' | 'NAO_CONFIRMADO';
  medicamento: { nome: string; dosagem: string; observacao?: string };
};

const STATUS_CONFIG = {
  PENDENTE:       { label: 'Pendente',       color: '#B45309', bg: '#FEF3C7' },
  CONFIRMADO:     { label: 'Confirmado',     color: '#065F46', bg: '#D1FAE5' },
  ATRASADO:       { label: 'Atrasado',       color: '#991B1B', bg: '#FEE2E2' },
  CANCELADO:      { label: 'Cancelado',      color: '#374151', bg: '#F3F4F6' },
  NAO_CONFIRMADO: { label: 'Não Confirmado', color: '#7F1D1D', bg: '#FEE2E2' },
};

type Props = NativeStackScreenProps<RootStackParamList, 'Doses'>;

function canConfirmDose(status: Dose['status']) {
  return status === 'PENDENTE' || status === 'NAO_CONFIRMADO';
}

function confirmLabelForStatus(status: Dose['status']) {
  return status === 'NAO_CONFIRMADO' ? 'Confirmar mesmo assim' : 'Confirmar tomada';
}

export default function DosesScreen({ navigation, route }: Props) {
  const colors = useColors();
  const { hapticsEnabled } = useAccessibility();
  const toast = useToast();
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
    if (!confirmacaoId || loading) return;
    if (lastHandledNotificationConfirmacaoIdRef.current === confirmacaoId) return;
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
      triggerHaptic('success', hapticsEnabled);
      toast.show('Dose confirmada', 'success');
      setModalConfirmacaoId((current) => (current === id ? null : current));
      await buscar();
    } catch (e: any) {
      triggerHaptic('error', hapticsEnabled);
      Alert.alert('Erro', e.message);
    } finally {
      setConfirming(null);
    }
  }

  function fecharModal() {
    setModalConfirmacaoId(null);
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
        data={doses}
        keyExtractor={(item) => String(item.confirmacao_id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <AppText variant="body" color={colors.textMuted} style={styles.empty}>
            Nenhuma dose programada para hoje.
          </AppText>
        }
        renderItem={({ item, index }) => {
          const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.PENDENTE;
          const isConfirming = confirming === item.confirmacao_id;
          return (
            <Animated.View
              entering={FadeIn.delay(index * 40).duration(260)}
              style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}
            >
              <View style={styles.cardTop}>
                <View style={styles.medInfo}>
                  <AppText variant="bodyStrong" color={colors.textPrimary}>{item.medicamento.nome}</AppText>
                  <AppText variant="caption" color={colors.textSecondary} style={{ marginTop: 2 }}>
                    {item.medicamento.dosagem}
                  </AppText>
                </View>
                <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                  <AppText variant="caption" color={cfg.color} style={styles.badgeText}>
                    {cfg.label}
                  </AppText>
                </View>
              </View>

              <View style={styles.timeRow}>
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <AppText variant="caption" color={colors.textSecondary}>
                  Previsto: {formatBusinessTime(item.horario_previsto)}
                </AppText>
                {item.horario_confirmacao ? (
                  <AppText variant="caption" color={colors.textSecondary}>
                    {'  '}Confirmado: {formatConfirmationTime(item.horario_confirmacao)}
                  </AppText>
                ) : null}
              </View>

              {canConfirmDose(item.status) && (
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    triggerHaptic('light', hapticsEnabled);
                    confirmar(item.confirmacao_id);
                  }}
                  disabled={isConfirming}
                  accessibilityRole="button"
                  accessibilityLabel={`${confirmLabelForStatus(item.status)} ${item.medicamento.nome}`}
                  accessibilityState={{ disabled: isConfirming, busy: isConfirming }}
                >
                  {isConfirming ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={22} color={colors.white} />
                      <AppText variant="bodyStrong" color={colors.white}>
                        {confirmLabelForStatus(item.status)}
                      </AppText>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </Animated.View>
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
          <Animated.View entering={FadeIn.duration(220)} style={{ width: '100%' }}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}
              onPress={() => {}}
            >
              <View style={[styles.modalIconWrap, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="checkmark-circle-outline" size={26} color={colors.primary} />
              </View>
              <AppText variant="title" color={colors.textPrimary}>Confirmar tomada</AppText>
              {modalDose ? (
                <>
                  <AppText variant="body" color={colors.textSecondary} style={{ marginTop: 10, marginBottom: 22 }}>
                    Você tomou {modalDose.medicamento.nome} {modalDose.medicamento.dosagem} das{' '}
                    {formatBusinessTime(modalDose.horario_previsto)}?
                  </AppText>
                  <PrimaryButton
                    title={confirmLabelForStatus(modalDose.status)}
                    onPress={() => confirmar(modalDose.confirmacao_id)}
                    loading={confirming === modalDose.confirmacao_id}
                    style={{ marginBottom: 12 }}
                  />
                </>
              ) : null}
              <TouchableOpacity
                style={[styles.modalSecondaryButton, { borderColor: colors.border }]}
                onPress={fecharModal}
                accessibilityRole="button"
                accessibilityLabel="Agora não, fechar"
              >
                <AppText variant="bodyStrong" color={colors.textSecondary}>Agora não</AppText>
              </TouchableOpacity>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  empty: { textAlign: 'center', marginTop: 40 },
  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  medInfo: { flex: 1 },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginLeft: 8,
  },
  badgeText: { fontWeight: '700' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
    flexWrap: 'wrap',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 14,
    minHeight: 52,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 18, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalSecondaryButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
});
