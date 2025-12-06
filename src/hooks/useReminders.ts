import { useState, useEffect, useCallback, useRef } from "react";
import { Reminder, AppSettings } from "../types";
import {
  generateId,
  isReminder,
  calculateNextScheduledNotification,
  debounce,
  getErrorMessage,
} from "../utils/helpers";
import { ToastType } from "../components/ToastMessage";

export const useReminders = (
  settings: AppSettings,
  userId: string | null,
  addToast: (message: string, type?: ToastType, duration?: number) => void,
) => {
  const [reminders, setReminders] = useState<Reminder[]>(() => {
    const saved = localStorage.getItem("update-bell-data");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed.filter(isReminder) : [];
      } catch (_error) {
        addToast(
          `リマインダーデータの読み込みに失敗しました: ${getErrorMessage(_error)}`,
          "error",
        );
        return [];
      }
    }
    return [];
  });
  const [processingIds, setProcessingIds] = useState<
    Record<string, "deleting" | "saving">
  >({});

  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    localStorage.setItem("update-bell-data", JSON.stringify(reminders));
  }, [reminders]);

  const scheduleLocalNotification = useCallback(() => {
    if (
      !("serviceWorker" in navigator) ||
      !navigator.serviceWorker.controller
    ) {
      return;
    }
    const nextNotification = calculateNextScheduledNotification(reminders);
    if (nextNotification) {
      navigator.serviceWorker.controller.postMessage({
        type: "SCHEDULE_NEXT_REMINDER",
        payload: nextNotification,
      });
    } else {
      navigator.serviceWorker.controller.postMessage({
        type: "CANCEL_ALL_REMINDERS",
      });
    }
  }, [reminders]);

  const debouncedLocalScheduler = useRef(
    debounce((..._args: unknown[]) => {
      scheduleLocalNotification();
    }, 200),
  ).current;

  const addReminder = async (
    reminderData: Omit<Reminder, "id" | "createdAt" | "timezone">,
  ) => {
    const tempId = `new-${generateId()}`;
    setProcessingIds((prev) => ({ ...prev, [tempId]: "saving" }));

    try {
      const newReminder: Reminder = {
        ...reminderData,
        id: generateId(),
        createdAt: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        isPaused: reminderData.isPaused || false,
      };

      let nextReminders: Reminder[] = [];
      setReminders((prev) => {
        nextReminders = [...prev, newReminder];
        return nextReminders;
      });

      if (settings.notifications.method === "push") {
        await syncRemindersToServer(nextReminders);
      }

      return newReminder;
    } catch (error) {
      addToast(`リマインダーの追加に失敗: ${getErrorMessage(error)}`, "error");
      return null;
    } finally {
      setProcessingIds((prev) => {
        const newIds = { ...prev };
        delete newIds[tempId];
        return newIds;
      });
    }
  };

  const updateReminder = async (id: string, updates: Partial<Reminder>) => {
    setProcessingIds((prev) => ({ ...prev, [id]: "saving" }));
    try {
      const originalReminder = reminders.find((r) => r.id === id);
      if (!originalReminder)
        throw new Error("対象のリマインダーが見つかりません。");

      const updatedReminder = { ...originalReminder, ...updates };

      let nextReminders: Reminder[] = [];
      setReminders((prev) => {
        nextReminders = prev.map((r) => (r.id === id ? updatedReminder : r));
        return nextReminders;
      });

      if (settings.notifications.method === "push") {
        await syncRemindersToServer(nextReminders);
      }
    } catch (error) {
      addToast(`リマインダーの更新に失敗: ${getErrorMessage(error)}`, "error");
    } finally {
      setProcessingIds((prev) => {
        const newIds = { ...prev };
        delete newIds[id];
        return newIds;
      });
    }
  };

  const deleteReminder = async (id: string) => {
    setProcessingIds((prev) => ({ ...prev, [id]: "deleting" }));
    try {
      if (
        settings.notifications.method === "local" &&
        navigator.serviceWorker.controller
      ) {
        navigator.serviceWorker.controller.postMessage({
          type: "CANCEL_ALL_REMINDERS",
        });
      }

      const currentUserId = userIdRef.current;
      if (settings.notifications.method === "push" && currentUserId) {
        const response = await fetch("/api/delete-reminder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId, reminderId: id }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ message: "不明なエラー" }));
          throw new Error(
            `サーバー上のリマインダー削除に失敗しました (Status: ${response.status}): ${errorData.message || errorData.error}`,
          );
        }
      }

      setReminders((prev) => prev.filter((reminder) => reminder.id !== id));
      addToast("リマインダーを削除しました。", "success");
    } catch (error) {
      addToast(`リマインダーの削除に失敗: ${getErrorMessage(error)}`, "error");
    } finally {
      setProcessingIds((prev) => {
        const newIds = { ...prev };
        delete newIds[id];
        return newIds;
      });
    }
  };

  useEffect(() => {
    if (settings.notifications.method === "local") {
      debouncedLocalScheduler();
    }
  }, [reminders, settings.notifications.method, debouncedLocalScheduler]);

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

  const getStats = () => {
    return {
      total: reminders.length,
      active: getActiveReminders().length,
      paused: getPausedReminders().length,
      withNotifications: reminders.filter((r) => r.lastNotified).length,
      totalTags: getAllTags().length,
    };
  };

  const syncRemindersToServer = async (remindersToSync?: Reminder[]) => {
    const currentUserId = userIdRef.current;
    if (!currentUserId) {
      throw new Error("ユーザーIDが利用できません。");
    }

    setProcessingIds((prev) => ({ ...prev, bulk_sync: "saving" }));

    try {
      const remindersToProcess = remindersToSync || reminders;

      if (remindersToProcess.length === 0) {
        return;
      }

      const response = await fetch("/api/bulk-sync-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          reminders: remindersToProcess,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `サーバーとの同期に失敗しました: ${errorData.message || response.statusText}`,
        );
      }
    } finally {
      setProcessingIds((prev) => {
        const newIds = { ...prev };
        delete newIds.bulk_sync;
        return newIds;
      });
    }
  };

  const overwriteReminders = (newReminders: Reminder[]) => {
    setReminders(newReminders);
  };

  return {
    reminders,
    addReminder,
    updateReminder,
    deleteReminder,
    processingIds,
    getReminder,
    getActiveReminders,
    getPausedReminders,
    getAllTags,
    getRemindersByTag,
    searchReminders,
    getStats,
    syncRemindersToServer,
    overwriteReminders,
  };
};
