import { useState, useEffect } from "react";
import { AppSettings } from "../types";
import { ToastType } from "../components/ToastMessage"; // 追加
import { getErrorMessage } from "../utils/helpers"; // 追加

const defaultSettings: AppSettings = {
  theme: "system",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  lastTimezoneCheck: new Date().toISOString(),
  notifications: {
    enabled: false,
    permission: "default",
    method: "local",
  },
  ui: {
    showWelcome: true,
  },
};

export const useSettings = (
  addToast: (message: string, type?: ToastType, duration?: number) => void, // 追加
) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("update-bell-settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // ネストしたオブジェクトもマージするように修正
        return {
          ...defaultSettings,
          ...parsed,
          notifications: {
            ...defaultSettings.notifications,
            ...(parsed.notifications || {}),
          },
          ui: {
            ...defaultSettings.ui,
            ...(parsed.ui || {}),
          },
        };
      } catch (error) {
        addToast(
          `設定の読み込みに失敗しました: ${getErrorMessage(error)}`,
          "error",
        ); // 変更
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
      addToast(
        `通知許可の取得に失敗しました: ${getErrorMessage(error)}`,
        "error",
      );
      return false;
    }
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  const importSettings = (
    importedSettings: AppSettings,
  ): { settings: AppSettings; pushNotificationFallback: boolean } => {
    let finalSettings = { ...importedSettings };
    let pushNotificationFallback = false;

    // プッシュ通知がサポートされていない環境でプッシュ設定をインポートしようとした場合
    if (
      finalSettings.notifications.method === "push" &&
      !("PushManager" in window)
    ) {
      finalSettings = {
        ...finalSettings,
        notifications: {
          ...finalSettings.notifications,
          method: "local",
        },
      };
      pushNotificationFallback = true;
    }

    setSettings(finalSettings);

    return { settings: finalSettings, pushNotificationFallback };
  };

  return {
    settings,
    updateSettings,
    requestNotificationPermission,
    resetSettings,
    importSettings,
  };
};
