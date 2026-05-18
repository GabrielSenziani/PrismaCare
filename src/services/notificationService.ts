import { Platform } from 'react-native';
import { isExpoGoRuntime } from '../utils/googleSignin';

type NotificationsModule = typeof import('expo-notifications');
type NotificationResponse = {
  notification?: {
    request?: {
      identifier?: string;
      content?: {
        data?: Record<string, unknown> | null;
      };
    };
  };
};
type NotificationSubscription = { remove(): void };
type DoseNotificationPressHandler = (confirmacaoId: number) => void;

const REMINDER_CHANNEL_ID = 'dose-reminders';
const REMINDER_SOURCE = 'prismacare';
const REMINDER_KIND = 'dose-reminder';
const OVERDUE_KIND = 'dose-overdue';
const LOCAL_REMINDER_GRACE_MINUTES = 2;

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
let notificationPressHandler: DoseNotificationPressHandler | null = null;
let notificationResponseSubscription: NotificationSubscription | null = null;
let lastHandledNotificationKey: string | null = null;
let checkedInitialNotificationResponse = false;
const immediateReminderDeliveredAt = new Map<string, number>();

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
export function configureDoseNotifications(onPressNotification?: DoseNotificationPressHandler) {
  notificationPressHandler = onPressNotification ?? notificationPressHandler;
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

  if (!notificationResponseSubscription) {
    notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response as NotificationResponse);
    });
  }

  if (!checkedInitialNotificationResponse) {
    checkedInitialNotificationResponse = true;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response as NotificationResponse);
        void Notifications.clearLastNotificationResponseAsync();
      }
    });
  }
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

function isSupportedDoseNotificationKind(kind: unknown) {
  return kind === REMINDER_KIND || kind === OVERDUE_KIND;
}

function extractDoseNotificationIntent(response: NotificationResponse): { confirmacaoId: number; notificationKey: string } | null {
  const request = response.notification?.request;
  const data = request?.content?.data;
  if (!data || !isSupportedDoseNotificationKind(data.kind)) {
    return null;
  }

  const confirmacaoId = Number(data.confirmacaoId);
  if (!Number.isInteger(confirmacaoId) || confirmacaoId <= 0) {
    return null;
  }

  const identifier = typeof request?.identifier === 'string' && request.identifier
    ? request.identifier
    : `${String(data.kind)}:${confirmacaoId}`;

  return {
    confirmacaoId,
    notificationKey: identifier,
  };
}

function handleNotificationResponse(response: NotificationResponse) {
  const intent = extractDoseNotificationIntent(response);
  if (!intent) return;
  if (lastHandledNotificationKey === intent.notificationKey) return;

  lastHandledNotificationKey = intent.notificationKey;
  notificationPressHandler?.(intent.confirmacaoId);
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

type ReminderSyncItem = {
  dose: DoseReminderInput;
  reminderKey: string;
  scheduledAt: Date;
  behavior: 'schedule' | 'notify-now';
};

function buildReminderSyncItems(doses: DoseReminderInput[]) {
  const now = Date.now();
  const graceMs = LOCAL_REMINDER_GRACE_MINUTES * 60 * 1000;
  const reminders: ReminderSyncItem[] = [];

  for (const dose of doses) {
    if (dose.status !== 'PENDENTE') {
      continue;
    }

    const scheduledAt = parseLocalDateTime(dose.horario_previsto);
    if (!scheduledAt) {
      continue;
    }

    const reminderKey = reminderKeyFor(dose.confirmacao_id);
    const scheduledTime = scheduledAt.getTime();

    if (scheduledTime > now) {
      reminders.push({
        dose,
        reminderKey,
        scheduledAt,
        behavior: 'schedule',
      });
      continue;
    }

    if (now - scheduledTime <= graceMs) {
      reminders.push({
        dose,
        reminderKey,
        scheduledAt,
        behavior: 'notify-now',
      });
    }
  }

  return reminders;
}

function buildReminderContent(reminder: ReminderSyncItem['dose'], reminderKey: string) {
  return {
    title: 'Hora do medicamento',
    body: `Está na hora de tomar ${reminder.medicamento.nome} ${reminder.medicamento.dosagem}.`,
    data: {
      source: REMINDER_SOURCE,
      kind: REMINDER_KIND,
      confirmacaoId: reminder.confirmacao_id,
      reminderKey,
    },
  };
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

    const reminders = buildReminderSyncItems(doses);
    const futureReminders = reminders.filter((reminder) => reminder.behavior === 'schedule');
    const immediateReminders = reminders.filter((reminder) => reminder.behavior === 'notify-now');
    const futureKeys = new Set(futureReminders.map((reminder) => reminder.reminderKey));
    const immediateKeys = new Set(immediateReminders.map((reminder) => reminder.reminderKey));
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledDoseReminders = scheduled.filter((notification) =>
      isPrismaCareDoseReminder(notification.content.data as ReminderData | null | undefined),
    );
    const scheduledKeys = new Set<string>();

    await Promise.all(scheduledDoseReminders.map(async (notification) => {
      const data = notification.content.data as ReminderData;
      if (typeof data.reminderKey !== 'string') return;

      scheduledKeys.add(data.reminderKey);
      if (!futureKeys.has(data.reminderKey)) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }));

    await Promise.all(futureReminders.map(async ({ dose, reminderKey, scheduledAt }) => {
      if (scheduledKeys.has(reminderKey)) return;

      await Notifications.scheduleNotificationAsync({
        content: buildReminderContent(dose, reminderKey),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: scheduledAt,
          channelId: REMINDER_CHANNEL_ID,
        },
      });
    }));

    for (const { dose, reminderKey } of immediateReminders) {
      if (immediateReminderDeliveredAt.has(reminderKey)) {
        continue;
      }

      await Notifications.scheduleNotificationAsync({
        content: buildReminderContent(dose, reminderKey),
        trigger: null,
      });
      immediateReminderDeliveredAt.set(reminderKey, Date.now());
    }

    const activeKeys = new Set(reminders.map((reminder) => reminder.reminderKey));
    for (const key of [...immediateReminderDeliveredAt.keys()]) {
      if (!activeKeys.has(key) || !immediateKeys.has(key)) {
        immediateReminderDeliveredAt.delete(key);
      }
    }
  } catch (error) {
    console.warn('Falha ao sincronizar notificações locais de dose.', error);
  }
}
