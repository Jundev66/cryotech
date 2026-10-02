import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/**
 * Native Haptic Feedback for touches & interactions
 * Silently falls back if running in browser
 */
export const haptics = {
  light: async () => {
    if (!isNative) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  },
  medium: async () => {
    if (!isNative) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {}
  },
  success: async () => {
    if (!isNative) return;
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch {}
  },
  error: async () => {
    if (!isNative) return;
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  },
};

/**
 * Status bar & native styling configuration
 */
export const configureNativeApp = async () => {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0f172a' });
  } catch {}
};

/**
 * Storage helpers with Capacitor Preferences
 */
export const storage = {
  get: async (key: string): Promise<string | null> => {
    if (isNative) {
      try {
        const { value } = await Preferences.get({ key });
        if (value !== null && value !== undefined) return value;
      } catch {}
      return localStorage.getItem(key);
    }
    return localStorage.getItem(key);
  },
  set: async (key: string, value: string): Promise<void> => {
    try {
      localStorage.setItem(key, value);
    } catch {}
    if (isNative) {
      try {
        await Preferences.set({ key, value });
      } catch {}
    }
  },
  remove: async (key: string): Promise<void> => {
    try {
      localStorage.removeItem(key);
    } catch {}
    if (isNative) {
      try {
        await Preferences.remove({ key });
      } catch {}
    }
  },
};

/**
 * Network monitor
 */
export const getNetworkStatus = async () => {
  try {
    const status = await Network.getStatus();
    return status.connected;
  } catch {
    return navigator.onLine;
  }
};
