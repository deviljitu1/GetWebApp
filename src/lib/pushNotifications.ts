import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { playNotificationSound } from '@/lib/notifications';

const CHANNEL_ID = 'getwebapp_alerts';
const REMOTE_PUSH_ENABLED = import.meta.env.VITE_ENABLE_PUSH_NOTIFICATIONS === 'true';
let isInitialized = false;

export interface NotificationPayload {
  title: string;
  body: string;
  id?: number;
  data?: Record<string, any>;
  scheduleAt?: Date;
}

/**
 * Initialize Push and Local notifications.
 * Sets up Android notification channel, requests permissions,
 * and registers FCM device token with Supabase if on mobile.
 */
export async function initNotifications(userId?: string) {
  if (isInitialized) return;
  isInitialized = true;

  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      // 1. Create Android Notification Channel
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'GetWebApp Alerts',
        description: 'Urgent task updates, timer reminders, and team messages',
        importance: 5, // High importance (banners + heads-up)
        visibility: 1, // Public on lockscreen
        vibration: true,
        lights: true,
        lightColor: '#2563EB',
      });

      // 2. Request Local Notification permissions
      const localPerm = await LocalNotifications.requestPermissions();
      console.log('[Notifications] Local permissions:', localPerm);

      // 3. Register for remote push only after Firebase has been configured.
      // Calling FirebaseMessaging without google-services.json can crash Android.
      if (REMOTE_PUSH_ENABLED) {
        const pushPerm = await PushNotifications.requestPermissions();
        console.log('[Notifications] Push permissions:', pushPerm);

        if (pushPerm.receive === 'granted') {
        // Register with Google FCM / Apple APNs
          await PushNotifications.register();

          // On successful token registration, save to Supabase
          PushNotifications.addListener('registration', async (token) => {
            console.log('[Notifications] Push token received:', token.value);
            if (userId) {
              await saveDeviceToken(userId, token.value, Capacitor.getPlatform());
            }
          });

          PushNotifications.addListener('registrationError', (err) => {
            console.warn('[Notifications] Push registration error:', err);
          });

          // Listen for foreground push notifications
          PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[Notifications] Push received in foreground:', notification);
            playNotificationSound();
            // Display as a local banner so the user sees it
            showNativeNotification({
              title: notification.title || 'GetWebApp Alert',
              body: notification.body || '',
              data: notification.data,
            });
          });

          // Handle user clicking on a push notification
          PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            console.log('[Notifications] Push notification tapped:', action);
            const link = action.notification.data?.link_url;
            if (link && typeof window !== 'undefined') {
              window.location.href = link;
            }
          });
        }
      }

      // Handle user clicking on local notifications
      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        console.log('[Notifications] Local notification tapped:', action);
        const link = action.notification.extra?.link_url;
        if (link && typeof window !== 'undefined') {
          window.location.href = link;
        }
      });

      // Schedule default daily reminders (e.g. 6:00 PM EOD reminder)
      await scheduleDailyReminders();

    } catch (err) {
      console.error('[Notifications] Failed to initialize native notifications:', err);
    }
  } else {
    // Web browser fallback
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch (e) {
          // ignore
        }
      }
    }
  }
}

/**
 * Save device push token to Supabase user_device_tokens table
 */
export async function saveDeviceToken(userId: string, token: string, platform = 'android') {
  try {
    const { error } = await supabase.from('user_device_tokens').upsert(
      {
        user_id: userId,
        token: token,
        platform: platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );
    if (error) throw error;
    console.log('[Notifications] Device token saved to Supabase');
  } catch (err) {
    console.error('[Notifications] Error saving device token:', err);
  }
}

/**
 * Display a native notification banner on mobile, or HTML5 Notification on web.
 */
export async function showNativeNotification(payload: NotificationPayload): Promise<boolean> {
  const isNative = Capacitor.isNativePlatform();
  const id = payload.id || Math.floor(Math.random() * 1000000);

  playNotificationSound();

  if (isNative) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: payload.title,
            body: payload.body,
            id: id,
            channelId: CHANNEL_ID,
            schedule: payload.scheduleAt ? { at: payload.scheduleAt } : undefined,
            extra: payload.data || {},
            smallIcon: 'ic_launcher_round',
            iconColor: '#2563EB',
          },
        ],
      });
      return true;
    } catch (err) {
      console.error('[Notifications] LocalNotifications schedule failed:', err);
      return false;
    }
  }

  // Web Browser fallback
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(payload.title, {
        body: payload.body,
        icon: '/favicon.ico',
        data: payload.data,
      });
      return true;
    } catch (e) {
      console.error('[Notifications] Web Notification error:', e);
    }
  }

  return false;
}

/**
 * Schedule standard daily work reminders on device
 */
export async function scheduleDailyReminders() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    // Check pending notifications to prevent duplicating
    const pending = await LocalNotifications.getPending();
    const hasEod = pending.notifications.some((n) => n.id === 9999);
    const hasMorning = pending.notifications.some((n) => n.id === 9998);

    const now = new Date();

    // 1. End of Day Reminder (6:00 PM daily)
    if (!hasEod) {
      const eodTime = new Date();
      eodTime.setHours(18, 0, 0, 0);
      if (eodTime <= now) {
        eodTime.setDate(eodTime.getDate() + 1); // schedule for tomorrow if already past 6 PM
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            id: 9999,
            title: 'End of Day Summary 📝',
            body: 'Time to wrap up! Check off your completed tasks and submit your daily update.',
            channelId: CHANNEL_ID,
            schedule: {
              at: eodTime,
              repeats: true,
              every: 'day',
            },
            smallIcon: 'ic_launcher_round',
          },
        ],
      });
    }

    // 2. Morning Workday Start Reminder (9:30 AM daily)
    if (!hasMorning) {
      const morningTime = new Date();
      morningTime.setHours(9, 30, 0, 0);
      if (morningTime <= now) {
        morningTime.setDate(morningTime.getDate() + 1);
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            id: 9998,
            title: 'Good Morning! ⚡',
            body: 'Ready for today? Review your assigned tasks and start your first timer.',
            channelId: CHANNEL_ID,
            schedule: {
              at: morningTime,
              repeats: true,
              every: 'day',
            },
            smallIcon: 'ic_launcher_round',
          },
        ],
      });
    }
  } catch (err) {
    console.warn('[Notifications] Could not schedule recurring reminders:', err);
  }
}
