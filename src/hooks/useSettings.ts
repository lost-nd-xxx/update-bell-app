import { useState, useEffect } from "react";
import { AppSettings } from "../types";

const defaultSettings: AppSettings = {
  theme: "system",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  lastTimezoneCheck: new Date().toISOString(),
  notifications: {
    enabled: false,
    permission: "default",
  },
  ui: {
    showWelcome: true,
    compactMode: false,
  },
};

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("update-bell-settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...defaultSettings, ...parsed };
      } catch (error) {
        console.error("設定の読み込みに失敗:", error);
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  // 設定をlocalStorageに保存
  useEffect(() => {
    localStorage.setItem("update-bell-settings", JSON.stringify(settings));
  }, [settings]);

  // 初期化時に通知許可状態を同期する
  useEffect(() => {
    if ("Notification" in window) {
      setSettings((prev) => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          permission: Notification.permission,
          enabled: Notification.permission === "granted",
        },
      }));
    } else {
      setSettings((prev) => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          permission: "unsupported",
          enabled: false,
        },
      }));
    }
  }, []); // 空の依存配列で、マウント時に一度だけ実行

  // タイムゾーンを定期的にチェック
  useEffect(() => {
    const checkTimezone = () => {
      const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (currentTimezone !== settings.timezone) {
        setSettings((prev) => ({
          ...prev,
          timezone: currentTimezone,
          lastTimezoneCheck: new Date().toISOString(),
        }));
      }
    };

    // 1時間ごとにチェック
    const interval = setInterval(checkTimezone, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [settings.timezone]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  const requestNotificationPermission = async (): Promise<boolean> => {
    if (!("Notification" in window)) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setSettings((prev) => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          permission,
          enabled: permission === "granted",
        },
      }));
      return permission === "granted";
    } catch (error) {
      console.error("通知許可の取得に失敗:", error);
      return false;
    }
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  return {
    settings,
    updateSettings,
    requestNotificationPermission,
    resetSettings,
  };
};
