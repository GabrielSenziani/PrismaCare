import { api } from './api';
import { DoseReminderInput, syncDoseReminders } from './notificationService';

export async function syncCurrentDoseReminders() {
  const doses = await api<DoseReminderInput[]>('/api/doses/hoje');
  await syncDoseReminders(doses);
  return doses;
}
