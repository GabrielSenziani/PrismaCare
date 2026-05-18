import React, { useCallback, useContext, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { AuthContext } from '../contexts/AuthContext';
import { RootStackParamList } from '../../App';
import { api } from '../services/api';
import { DoseReminderInput, syncDoseReminders } from '../services/notificationService';
import { syncRemotePushTokenRegistration } from '../services/pushRegistrationService';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

type MenuItem = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: keyof RootStackParamList;
  color: string;
};

const MENU: MenuItem[] = [
  { title: 'Medicamentos', subtitle: 'Cadastrar e listar', icon: 'medkit-outline', screen: 'Medicamentos', color: '#5BAD8F' },
  { title: 'Agendamentos', subtitle: 'Horários e doses', icon: 'calendar-outline', screen: 'Agendamentos', color: '#7DD3AE' },
  { title: 'Contatos', subtitle: 'Emergência e cuidadores', icon: 'people-outline', screen: 'Contatos', color: '#3D8B6E' },
  { title: 'Doses de Hoje', subtitle: 'Confirmar tomadas', icon: 'checkmark-circle-outline', screen: 'Doses', color: '#2A6B52' },
];

export default function HomeScreen({ navigation }: Props) {
  const { profile, timezoneConfirmed, signOut } = useContext(AuthContext);
  const [hasContacts, setHasContacts] = useState<boolean | null>(null);
  const [hasMedications, setHasMedications] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadSuggestions() {
        try {
          const [contacts, medications, doses] = await Promise.all([
            api<unknown[]>('/api/contatos'),
            api<unknown[]>('/api/medicamentos'),
            api<DoseReminderInput[]>('/api/doses/hoje'),
          ]);
          if (!active) return;
          setHasContacts(contacts.length > 0);
          setHasMedications(medications.length > 0);
          await syncDoseReminders(doses);
          await syncRemotePushTokenRegistration(profile?.id ?? null, timezoneConfirmed === true);
        } catch (e: any) {
          if (!active) return;
          Alert.alert('Erro', e.message);
        }
      }

      loadSuggestions();
      return () => {
        active = false;
      };
    }, [profile?.id, timezoneConfirmed]),
  );

  const displayName = profile?.nome?.trim();
  const greeting = displayName ? `Olá, ${displayName}` : 'Olá!';
  const showSuggestions = hasContacts === false || hasMedications === false;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.greetingSub}>O que você quer fazer?</Text>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
              <Ionicons name="log-out-outline" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {showSuggestions && (
          <View style={styles.suggestions}>
            {hasContacts === null || hasMedications === null ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                {hasContacts === false && (
                  <TouchableOpacity
                    style={styles.suggestionCard}
                    activeOpacity={0.86}
                    onPress={() => navigation.navigate('Contatos')}
                  >
                    <View style={styles.suggestionIcon}>
                      <Ionicons name="people-outline" size={22} color={colors.primary} />
                    </View>
                    <View style={styles.suggestionTextWrap}>
                      <Text style={styles.suggestionTitle}>Adicionar alguém de confiança</Text>
                      <Text style={styles.suggestionSub}>
                        Cadastre uma pessoa para consultar rapidamente em caso de necessidade.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                )}

                {hasMedications === false && (
                  <TouchableOpacity
                    style={styles.suggestionCard}
                    activeOpacity={0.86}
                    onPress={() => navigation.navigate('Medicamentos')}
                  >
                    <View style={styles.suggestionIcon}>
                      <Ionicons name="medkit-outline" size={22} color={colors.primary} />
                    </View>
                    <View style={styles.suggestionTextWrap}>
                      <Text style={styles.suggestionTitle}>Cadastrar primeiro medicamento</Text>
                      <Text style={styles.suggestionSub}>
                        Cadastre apenas o medicamento agora. Horários e lembretes podem ser configurados depois.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}

        <View style={styles.grid}>
          {MENU.map((item) => (
            <TouchableOpacity
              key={item.screen}
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => navigation.navigate(item.screen as any)}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon} size={28} color={item.color} />
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSub}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: (StatusBar.currentHeight ?? 0) + 16,
    paddingBottom: 28,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: { fontSize: 22, fontWeight: '800', color: colors.white },
  greetingSub: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  suggestions: {
    gap: 10,
    marginBottom: 16,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  suggestionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  suggestionTextWrap: { flex: 1 },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  suggestionSub: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  cardSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});
