import React, { useCallback, useContext, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, useAccessibility } from '../contexts/AccessibilityContext';
import { AuthContext } from '../contexts/AuthContext';
import { RootStackParamList } from '../../App';
import { api } from '../services/api';
import { DoseReminderInput, syncDoseReminders } from '../services/notificationService';
import { syncRemotePushTokenRegistration } from '../services/pushRegistrationService';
import PrimaryButton from '../components/PrimaryButton';
import AppText from '../components/AppText';
import { useToast } from '../components/Toast';
import { triggerHaptic } from '../utils/haptics';
import { formatBusinessTime } from '../utils/dateTime';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

type DoseStatus = 'PENDENTE' | 'CONFIRMADO' | 'ATRASADO' | 'CANCELADO' | 'NAO_CONFIRMADO';

type Dose = DoseReminderInput & {
  confirmacao_id: number;
  horario_previsto: string;
  horario_confirmacao: string | null;
  status: DoseStatus;
  medicamento: { nome: string; dosagem: string; observacao?: string };
};

type MenuItem = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: keyof RootStackParamList;
};

const MENU: MenuItem[] = [
  { title: 'Doses de Hoje',  subtitle: 'Confirmar tomadas',        icon: 'checkmark-circle-outline', screen: 'Doses' },
  { title: 'Medicamentos',   subtitle: 'Cadastrar e listar',       icon: 'medkit-outline',           screen: 'Medicamentos' },
  { title: 'Agendamentos',   subtitle: 'Horários e doses',         icon: 'calendar-outline',         screen: 'Agendamentos' },
  { title: 'Contatos',       subtitle: 'Emergência e cuidadores',  icon: 'people-outline',           screen: 'Contatos' },
];

function isPending(status: DoseStatus) {
  return status === 'PENDENTE' || status === 'NAO_CONFIRMADO';
}

function pickNextDose(doses: Dose[]): Dose | null {
  const pendentes = doses.filter((d) => isPending(d.status));
  if (pendentes.length === 0) return null;
  return pendentes.sort((a, b) =>
    a.horario_previsto.localeCompare(b.horario_previsto),
  )[0];
}

export default function HomeScreen({ navigation }: Props) {
  const colors = useColors();
  const { hapticsEnabled } = useAccessibility();
  const { profile, timezoneConfirmed, signOut } = useContext(AuthContext);
  const toast = useToast();

  const [hasContacts, setHasContacts] = useState<boolean | null>(null);
  const [hasMedications, setHasMedications] = useState<boolean | null>(null);
  const [nextDose, setNextDose] = useState<Dose | null>(null);
  const [dosesReady, setDosesReady] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [contacts, medications, doses] = await Promise.all([
        api<unknown[]>('/api/contatos'),
        api<unknown[]>('/api/medicamentos'),
        api<Dose[]>('/api/doses/hoje'),
      ]);
      setHasContacts(contacts.length > 0);
      setHasMedications(medications.length > 0);
      setNextDose(pickNextDose(doses));
      setDosesReady(true);
      await syncDoseReminders(doses);
      await syncRemotePushTokenRegistration(profile?.id ?? null, timezoneConfirmed === true);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  }, [profile?.id, timezoneConfirmed]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        if (!active) return;
        await loadData();
      })();
      return () => {
        active = false;
      };
    }, [loadData]),
  );

  const displayName = profile?.nome?.trim();
  const greeting = displayName ? `Olá, ${displayName}` : 'Olá!';
  const showSuggestions = hasContacts === false || hasMedications === false;

  async function confirmarProximaDose() {
    if (!nextDose) return;
    setConfirming(true);
    try {
      await api(`/api/confirmacoes/${nextDose.confirmacao_id}/confirmar`, { method: 'PUT' });
      triggerHaptic('success', hapticsEnabled);
      toast.show('Dose confirmada', 'success');
      await loadData();
    } catch (e: any) {
      triggerHaptic('error', hapticsEnabled);
      Alert.alert('Não foi possível confirmar', e.message);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="title" color={colors.white} style={{ fontSize: 26, lineHeight: 32 }}>
                {greeting}
              </AppText>
              <AppText variant="body" color="rgba(255,255,255,0.85)" style={{ marginTop: 2 }}>
                O que você quer fazer?
              </AppText>
            </View>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.navigate('Configuracoes')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Configurações de acessibilidade"
            >
              <Ionicons name="settings-outline" size={24} color={colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, { marginLeft: 8 }]}
              onPress={() => setShowLogoutModal(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Sair da conta"
            >
              <Ionicons name="log-out-outline" size={24} color={colors.white} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* HERO — próxima dose */}
        {!dosesReady ? (
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : nextDose ? (
          <Animated.View
            entering={FadeInDown.duration(420).springify().damping(14)}
            style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}
          >
            <View style={styles.heroTop}>
              <View style={[styles.heroIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="medkit" size={32} color={colors.primary} />
              </View>
              <View style={styles.heroTopText}>
                <AppText variant="caption" color={colors.textSecondary}>Próxima dose</AppText>
                <AppText variant="title" color={colors.textPrimary} numberOfLines={2}>
                  {nextDose.medicamento.nome}
                </AppText>
                <AppText variant="body" color={colors.textSecondary} numberOfLines={1}>
                  {nextDose.medicamento.dosagem}
                </AppText>
              </View>
            </View>
            <View style={[styles.heroTime, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="time-outline" size={22} color={colors.primary} />
              <AppText variant="title" color={colors.primary} style={{ marginLeft: 8 }}>
                {formatBusinessTime(nextDose.horario_previsto)}
              </AppText>
            </View>
            <PrimaryButton
              title="Confirmar dose tomada"
              onPress={confirmarProximaDose}
              loading={confirming}
              iconName="checkmark-circle-outline"
              large
              style={{ marginTop: 16 }}
              accessibilityHint={`Confirma a dose de ${nextDose.medicamento.nome}`}
            />
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeIn.duration(360)}
            style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.heroTop}>
              <View style={[styles.heroIcon, { backgroundColor: colors.successBg }]}>
                <Ionicons name="checkmark-circle" size={32} color={colors.success} />
              </View>
              <View style={styles.heroTopText}>
                <AppText variant="title" color={colors.textPrimary}>Tudo em dia</AppText>
                <AppText variant="body" color={colors.textSecondary}>
                  Nenhuma dose pendente no momento.
                </AppText>
              </View>
            </View>
          </Animated.View>
        )}

        {showSuggestions && (
          <View style={styles.suggestions}>
            {hasContacts === null || hasMedications === null ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                {hasContacts === false && (
                  <SuggestionCard
                    icon="people-outline"
                    title="Adicionar alguém de confiança"
                    subtitle="Cadastre uma pessoa para consultar em caso de necessidade."
                    onPress={() => navigation.navigate('Contatos')}
                  />
                )}
                {hasMedications === false && (
                  <SuggestionCard
                    icon="medkit-outline"
                    title="Cadastrar primeiro medicamento"
                    subtitle="Horários e lembretes podem ser configurados depois."
                    onPress={() => navigation.navigate('Medicamentos')}
                  />
                )}
              </>
            )}
          </View>
        )}

        <View style={styles.grid}>
          {MENU.map((item, index) => (
            <Animated.View
              key={item.screen}
              entering={FadeInDown.delay(120 + index * 70).duration(380).springify().damping(16)}
              style={styles.cardWrap}
            >
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}
                activeOpacity={0.85}
                onPress={() => {
                  triggerHaptic('light', hapticsEnabled);
                  navigation.navigate(item.screen as any);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.subtitle}`}
              >
                <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name={item.icon} size={32} color={colors.primary} />
                </View>
                <AppText variant="bodyStrong" color={colors.textPrimary} style={{ marginTop: 12 }}>
                  {item.title}
                </AppText>
                <AppText variant="caption" color={colors.textSecondary} style={{ marginTop: 4 }}>
                  {item.subtitle}
                </AppText>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowLogoutModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, shadowColor: colors.shadow }]} onPress={() => {}}>
            <View style={[styles.modalIconWrap, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="log-out-outline" size={26} color={colors.primary} />
            </View>
            <AppText variant="title" color={colors.textPrimary}>Sair da conta</AppText>
            <AppText variant="body" color={colors.textSecondary} style={{ marginTop: 8 }}>
              Você realmente deseja sair do PrismaCare neste aparelho?
            </AppText>
            <PrimaryButton
              title="Sim, sair"
              onPress={() => { setShowLogoutModal(false); signOut(); }}
              iconName="arrow-forward-outline"
              style={{ marginTop: 24 }}
            />
            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={() => setShowLogoutModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
            >
              <AppText variant="bodyStrong" color={colors.textMuted}>Cancelar</AppText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SuggestionCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const { hapticsEnabled } = useAccessibility();
  return (
    <TouchableOpacity
      style={[styles.suggestionCard, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}
      activeOpacity={0.86}
      onPress={() => {
        triggerHaptic('light', hapticsEnabled);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <View style={[styles.suggestionIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <View style={styles.suggestionTextWrap}>
        <AppText variant="bodyStrong" color={colors.textPrimary}>{title}</AppText>
        <AppText variant="caption" color={colors.textSecondary} style={{ marginTop: 2 }}>
          {subtitle}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: (StatusBar.currentHeight ?? 0) + 16,
    paddingBottom: 28,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  heroCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroTopText: { flex: 1 },
  heroTime: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  suggestions: {
    gap: 10,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 14,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  suggestionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  suggestionTextWrap: { flex: 1, marginRight: 8 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardWrap: {
    width: '47.5%',
  },
  card: {
    minHeight: 150,
    borderRadius: 22,
    padding: 18,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalSecondaryButton: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
});
