import { Platform } from 'react-native';
import { isExpoGoRuntime } from '../utils/googleSignin';

type NotificationsModule = typeof import('expo-notifications');

const REMINDER_CHANNEL_ID = 'dose-reminders';
const REMINDER_SOURCE = 'prismacare';
const REMINDER_KIND = 'dose-reminder';

export type DoseReminderInput = {
  confirmacao_id: number;
  horario_previsto: string;
  status: string;
  medicamento: {
    nome: string;
    dosagem: string;
  };
};

type ReminderData = {
  source?: unknown;
  kind?: unknown;
  confirmacaoId?: unknown;
  reminderKey?: unknown;
};

let configured = false;
let permissionDenied = false;
let notificationsModule: NotificationsModule | null | undefined;

function getNotificationsModule(): NotificationsModule | null {
  if (Platform.OS === 'web' || isExpoGoRuntime()) return null;
  if (notificationsModule !== undefined) return notificationsModule;

  try {
    notificationsModule = require('expo-notifications') as NotificationsModule;
  } catch {
    notificationsModule = null;
  }

  return notificationsModule;
}

// Issue #40 usa apenas notificações locais; push remoto/tokens Expo/FCM/APNs ficam fora deste fluxo.
export function configureDoseNotifications() {
  if (configured || Platform.OS === 'web' || isExpoGoRuntime()) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android' || isExpoGoRuntime()) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Lembretes de medicamentos',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web' || permissionDenied || isExpoGoRuntime()) return false;
  const Notifications = getNotificationsModule();
  if (!Notifications) return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;

  const requested = await Notifications.requestPermissionsAsync();
  const granted = requested.status === 'granted';
  permissionDenied = !granted;
  return granted;
}

function reminderKeyFor(confirmacaoId: number) {
  return `prismacare-dose:${confirmacaoId}`;
}

function isPrismaCareDoseReminder(data: ReminderData | null | undefined) {
  return data?.source === REMINDER_SOURCE && data?.kind === REMINDER_KIND;
}

function parseLocalDateTime(value: string): Date | null {
  const [datePart, timePart] = value.trim().split(/[ T]/);
  if (!datePart || !timePart) return null;

  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second = 0] = timePart.split(':').map(Number);
  if ([year, month, day, hour, minute, second].some((part) => !Number.isFinite(part))) {
    return null;
  }

  const parsed = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildValidReminders(doses: DoseReminderInput[]) {
  const now = Date.now();

  return doses.flatMap((dose) => {
    if (dose.status !== 'PENDENTE') return [];

    const scheduledAt = parseLocalDateTime(dose.horario_previsto);
    if (!scheduledAt || scheduledAt.getTime() <= now) return [];

    const reminderKey = reminderKeyFor(dose.confirmacao_id);
    return [{
      dose,
      reminderKey,
      scheduledAt,
    }];
  });
}

export async function syncDoseReminders(doses: DoseReminderInput[]) {
  if (Platform.OS === 'web' || isExpoGoRuntime()) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    configureDoseNotifications();
    await ensureAndroidChannel();

    const granted = await requestNotificationPermission();
    if (!granted) return;

    const validReminders = buildValidReminders(doses);
    const validKeys = new Set(validReminders.map((reminder) => reminder.reminderKey));
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledDoseReminders = scheduled.filter((notification) =>
      isPrismaCareDoseReminder(notification.content.data as ReminderData | null | undefined),
    );
    const scheduledKeys = new Set<string>();

    await Promise.all(scheduledDoseReminders.map(async (notification) => {
      const data = notification.content.data as ReminderData;
      if (typeof data.reminderKey !== 'string') return;

      scheduledKeys.add(data.reminderKey);
      if (!validKeys.has(data.reminderKey)) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }));

    await Promise.all(validReminders.map(async ({ dose, reminderKey, scheduledAt }) => {
      if (scheduledKeys.has(reminderKey)) return;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Hora do medicamento',
          body: `Está na hora de tomar ${dose.medicamento.nome} ${dose.medicamento.dosagem}.`,
          data: {
            source: REMINDER_SOURCE,
            kind: REMINDER_KIND,
            confirmacaoId: dose.confirmacao_id,
            reminderKey,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: scheduledAt,
          channelId: REMINDER_CHANNEL_ID,
        },
      });
    }));
  } catch (error) {
    console.warn('Falha ao sincronizar notificações locais de dose.', error);
  }
}
