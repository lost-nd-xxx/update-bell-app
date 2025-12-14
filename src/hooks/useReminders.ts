import { useState, useEffect, useMemo } from "react";
import { Reminder, AppSettings } from "../types";
import { useUserId } from "../contexts/UserIdContext";
import {
  generateId,
  isReminder,
  getErrorMessage,
  calculateNextNotificationTime,
} from "../utils/helpers";
import { ToastType } from "../components/ToastMessage";

// userId引数は削除し、内部でuseUserIdから取得します
export const useReminders = (
  _settings: AppSettings, // 互換性のため残すが、内部では使用しない
  addToast: (message: string, type?: ToastType, duration?: number) => void,
) => {
  const { userId, getAuthHeaders } = useUserId();

  const [rawReminders, setRawReminders] = useState<Reminder[]>(() => {
    const saved = localStorage.getItem("update-bell-data");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed.filter(isReminder) : [];
      } catch (error) {
        addToast(
          `リマインダーデータの読み込みに失敗しました: ${getErrorMessage(error)}`,
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

  // rawReminders が更新されるたびに nextNotificationTime を計算し、reminders を生成
  const reminders = useMemo(() => {
    const now = new Date();
    return rawReminders.map((r) => ({
      ...r,
      nextNotificationTime: r.isPaused
        ? null
        : calculateNextNotificationTime(r.schedule, now),
    }));
  }, [rawReminders]);

  useEffect(() => {
    localStorage.setItem("update-bell-data", JSON.stringify(rawReminders));
  }, [rawReminders]);

  const addReminder = async (
    reminderData: Omit<Reminder, "id" | "createdAt" | "timezone">,
  ) => {
    setProcessingIds((prev) => ({ ...prev, new: "saving" }));

    try {
      const newReminder: Reminder = {
        ...reminderData,
        id: generateId(),
        createdAt: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        isPaused: reminderData.isPaused || false,
      };

      // Optimistic Update
      const nextRawReminders = [...rawReminders, newReminder];
      setRawReminders(nextRawReminders);

      if (userId) {
        const requestBody = { userId, reminder: newReminder };
        const authHeaders = await getAuthHeaders(requestBody);

        const response = await fetch("/api/reminders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeaders as Record<string, string>),
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error("Failed to save to server");
        }
      }

      return newReminder;
    } catch (error) {
      setRawReminders(rawReminders); // Rollback
      // トーストは呼び出し元(App.tsx)で出すか、ここで出すか。二重に出ないように注意。
      // App.tsxでは catch ブロックで `addToast` している。
      // ここで throw すると App.tsx の catch に行く。
      // ここでの addToast は削除し、エラーを throw して App.tsx に任せるのが筋だが、
      // Rollback はここで行う必要がある。
      // エラーメッセージの詳細を含めて throw する。
      throw error;
    } finally {
      setProcessingIds((prev) => {
        const newIds = { ...prev };
        delete newIds["new"];
        return newIds;
      });
    }
  };

  const updateReminder = async (id: string, updates: Partial<Reminder>) => {
    setProcessingIds((prev) => ({ ...prev, [id]: "saving" }));
    try {
      const originalReminder = rawReminders.find((r) => r.id === id);
      if (!originalReminder) throw new Error("Not found");

      const updatedReminder = { ...originalReminder, ...updates };
      const nextRawReminders = rawReminders.map((r) =>
        r.id === id ? updatedReminder : r,
      );
      setRawReminders(nextRawReminders);

      if (userId) {
        const requestBody = { userId, reminder: updatedReminder };
        const authHeaders = await getAuthHeaders(requestBody);

        const response = await fetch("/api/reminders", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(authHeaders as Record<string, string>),
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) throw new Error("Failed to update on server");
      }
    } catch (error) {
      setRawReminders(rawReminders); // Rollback
      throw error;
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
    const prevReminders = [...rawReminders];
    try {
      // Optimistic Update
      setRawReminders((prev) => prev.filter((r) => r.id !== id));

      if (userId) {
        const requestBody = { userId, reminderId: id };
        const authHeaders = await getAuthHeaders(requestBody);

        const response = await fetch("/api/reminders", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            ...(authHeaders as Record<string, string>),
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error("Failed to delete from server");
        }
      }
      addToast("リマインダーを削除しました。", "success");
    } catch (error) {
      setRawReminders(prevReminders); // Rollback
      throw error;
    } finally {
      setProcessingIds((prev) => {
        const newIds = { ...prev };
        delete newIds[id];
        return newIds;
      });
    }
  };

  const syncRemindersToServer = async (remindersToSync?: Reminder[]) => {
    if (!userId) return; // 認証なしなら何もしない（ローカルのみ）

    setProcessingIds((prev) => ({ ...prev, bulk_sync: "saving" }));
    try {
      const remindersToProcess = remindersToSync || rawReminders;
      // Note: We strip 'tags' logic inside the component usually, but here we send full object.
      // The API validates.

      const requestBody = {
        userId,
        reminders: remindersToProcess,
        sync: true, // Flag for batch sync
      };

      const authHeaders = await getAuthHeaders(requestBody);

      const response = await fetch("/api/reminders", {
        method: "PUT", // Batch sync uses PUT
        headers: {
          "Content-Type": "application/json",
          ...(authHeaders as Record<string, string>),
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Sync failed");
      }
    } catch (error) {
      addToast(`同期エラー: ${getErrorMessage(error)}`, "error");
      throw error;
    } finally {
      setProcessingIds((prev) => {
        const newIds = { ...prev };
        delete newIds.bulk_sync;
        return newIds;
      });
    }
  };

  const getReminder = (id: string) => reminders.find((r) => r.id === id);
  const getActiveReminders = () => reminders.filter((r) => !r.isPaused);
  const getPausedReminders = () => reminders.filter((r) => r.isPaused);

  const getAllTags = () => {
    const tags = new Set<string>();
    reminders.forEach((r) => r.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  };

  const getRemindersByTag = (tag: string) =>
    reminders.filter((r) => r.tags.includes(tag));

  const searchReminders = (query: string) => {
    const q = query.toLowerCase();
    return reminders.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.url.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)),
    );
  };

  const getStats = () => ({
    total: reminders.length,
    active: getActiveReminders().length,
    paused: getPausedReminders().length,
    withNotifications: reminders.filter((r) => r.lastNotified).length,
    totalTags: getAllTags().length,
  });

  const overwriteReminders = (newReminders: Reminder[]) => {
    setRawReminders(newReminders);
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
