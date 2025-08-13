import { useState, useEffect } from "react";
import { AppSettings } from "../types";

const defaultSettings: AppSettings = {
  notificationInterval: 30,
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
      console.error("通知許可リクエストエラー:", error);
      return false;
    }
  };

  return {
    settings,
    updateSettings,
    requestNotificationPermission,
  };
};