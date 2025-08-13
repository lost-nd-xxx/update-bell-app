// src/hooks/useReminders.ts - シンプル版
// Service Worker通信エラー対応・統一キー使用・移行処理なし

import { useState, useEffect, useCallback } from "react";
import { Reminder } from "../types";
import { generateId } from "../utils/helpers";

const debugLog = (message: string, data?: unknown) => {
  console.log(`[useReminders] ${message}`, data || "");
};

export const useReminders = () => {
  const [reminders, setReminders] = useState<Reminder[]>(() => {
    const saved = localStorage.getItem("update-bell-data");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.error("リマインダーデータの読み込みに失敗:", error);
        return [];
      }
    }
    return [];
  });

  // Service Worker通信エラー状態
  const [swSyncError, setSWyncError] = useState<string | null>(null);

  // リマインダーをlocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem("update-bell-data", JSON.stringify(reminders));
      debugLog(`LocalStorage保存完了: ${reminders.length}件`);
    } catch (error) {
      console.error("LocalStorage保存エラー:", error);
    }
  }, [reminders]);

  // Service Workerとの同期（エラー処理強化版）
  const syncWithServiceWorker = useCallback(async (data: Reminder[]) => {
    try {
      if ((window as any).updateBell?.updateRemindersCache) {
        const result = await (window as any).updateBell.updateRemindersCache(data);
        
        if (result.error) {
          setSWyncError(result.error);
          debugLog("Service Worker同期エラー", result.error);
        } else {
          setSWyncError(null);
          debugLog("Service Worker同期成功");
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setSWyncError(errorMessage);
      debugLog("Service Worker同期エラー", errorMessage);
    }
  }, []);

  // リマインダー変更時のService Worker同期
  useEffect(() => {
    if (reminders.length > 0) {
      const timeoutId = setTimeout(() => {
        syncWithServiceWorker(reminders);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [reminders, syncWithServiceWorker]);

  // Service Workerからのメッセージ受信
  useEffect(() => {
    const handleServiceWorkerMessage = (event: CustomEvent) => {
      const message = event.detail;
      debugLog("Service Workerメッセージ受信", message);

      switch (message.type) {
        case "NOTIFICATION_SENT":
          if (message.reminderId && message.timestamp) {
            debugLog(`通知送信記録: ${message.reminderId}`);
            updateReminder(message.reminderId, {
              lastNotified: message.timestamp,
            });
          }
          break;
        case "NOTIFICATION_CLICKED":
          debugLog(`通知クリック: ${message.reminderId}`);
          break;
        case "REQUEST_REMINDERS_DATA":
          debugLog("Service Workerからデータ要求");
          syncWithServiceWorker(reminders);
          break;
      }
    };

    window.addEventListener("serviceWorkerMessage", handleServiceWorkerMessage as EventListener);
    
    return () => {
      window.removeEventListener("serviceWorkerMessage", handleServiceWorkerMessage as EventListener);
    };
  }, [reminders, syncWithServiceWorker]);

  const addReminder = (
    reminderData: Omit<Reminder, "id" | "createdAt" | "timezone">,
  ) => {
    const newReminder: Reminder = {
      ...reminderData,
      id: generateId(),
      createdAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isPaused: reminderData.isPaused || false,
    };

    setReminders((prev) => [...prev, newReminder]);
    debugLog("リマインダー追加", { id: newReminder.id, title: newReminder.title });
    return newReminder;
  };

  const updateReminder = (id: string, updates: Partial<Reminder>) => {
    setReminders((prev) =>
      prev.map((reminder) =>
        reminder.id === id ? { ...reminder, ...updates } : reminder,
      ),
    );
    debugLog("リマインダー更新", { id, updates });
  };

  const deleteReminder = (id: string) => {
    setReminders((prev) => prev.filter((reminder) => reminder.id !== id));
    debugLog("リマインダー削除", { id });
  };

  const duplicateReminder = (id: string): Reminder | null => {
    const original = reminders.find((r) => r.id === id);
    if (!original) {
      console.error("複製するリマインダーが見つかりません:", id);
      return null;
    }

    const duplicated: Reminder = {
      ...original,
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      title: `${original.title} (コピー)`,
      createdAt: new Date().toISOString(),
      lastNotified: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    setReminders((prev) => [...prev, duplicated]);
    debugLog("リマインダー複製", { originalId: id, newId: duplicated.id });
    return duplicated;
  };

  const bulkUpdateReminders = (
    updates: Array<{ id: string; data: Partial<Reminder> }>,
  ) => {
    setReminders((prev) =>
      prev.map((reminder) => {
        const update = updates.find((u) => u.id === reminder.id);
        return update ? { ...reminder, ...update.data } : reminder;
      }),
    );
    debugLog("リマインダー一括更新", { count: updates.length });
  };

  const getReminder = (id: string): Reminder | undefined => {
    return reminders.find((r) => r.id === id);
  };

  const getActiveReminders = (): Reminder[] => {
    return reminders.filter((r) => !r.isPaused);
  };

  const getPausedReminders = (): Reminder[] => {
    return reminders.filter((r) => r.isPaused);
  };

  const getAllTags = (): string[] => {
    const tags = new Set<string>();
    reminders.forEach((reminder) => {
      reminder.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  };

  const getRemindersByTag = (tag: string): Reminder[] => {
    return reminders.filter((r) => r.tags.includes(tag));
  };

  const searchReminders = (query: string): Reminder[] => {
    const lowercaseQuery = query.toLowerCase();
    return reminders.filter(
      (reminder) =>
        reminder.title.toLowerCase().includes(lowercaseQuery) ||
        reminder.url.toLowerCase().includes(lowercaseQuery) ||
        reminder.tags.some((tag) => tag.toLowerCase().includes(lowercaseQuery)),
    );
  };

  // 統計情報を取得
  const getStats = () => {
    const total = reminders.length;
    const active = getActiveReminders().length;
    const paused = getPausedReminders().length;
    const withNotifications = reminders.filter((r) => r.lastNotified).length;

    return {
      total,
      active,
      paused,
      withNotifications,
      totalTags: getAllTags().length,
    };
  };

  // 手動通知チェック
  const triggerManualNotificationCheck = useCallback(async () => {
    try {
      if ((window as any).updateBell?.manualCheck) {
        const result = await (window as any).updateBell.manualCheck();
        debugLog("手動通知チェック完了", result);
        return { success: true, result, error: null };
      } else {
        throw new Error("Service Worker通信が利用できません");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      debugLog("手動通知チェック失敗", errorMessage);
      return { success: false, result: null, error: errorMessage };
    }
  }, []);

  return {
    reminders,
    addReminder,
    updateReminder,
    deleteReminder,
    duplicateReminder,
    bulkUpdateReminders,
    getReminder,
    getActiveReminders,
    getPausedReminders,
    getAllTags,
    getRemindersByTag,
    searchReminders,
    getStats,
    swSyncError,
    triggerManualNotificationCheck,
  };
};