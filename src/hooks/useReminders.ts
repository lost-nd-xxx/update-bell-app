import { useState, useEffect, useCallback, useRef } from "react";
import { Reminder, AppSettings } from "../types";
import {
  generateId,
  isReminder,
  calculateNextScheduledNotification,
  debounce,
  getErrorMessage,
} from "../utils/helpers";
import { usePushNotifications } from "./usePushNotifications";
import { ToastType } from "../components/ToastMessage"; // 追加

export const useReminders = (
  settings: AppSettings,
  userId: string | null,
  addToast: (message: string, type?: ToastType, duration?: number) => void, // 変更
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
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

  // usePushNotificationsから現在の購読情報を取得
  const { subscription } = usePushNotifications(addToast);
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // リマインダーをlocalStorageに保存
  useEffect(() => {
    localStorage.setItem("update-bell-data", JSON.stringify(reminders));
  }, [reminders]);

  // ローカル通知のスケジューリング（App.tsxから移動）
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

  // debounceされたローカル通知スケジューラーの参照
  const debouncedLocalScheduler = useRef(
    debounce((..._args: unknown[]) => {
      // _args に修正
      scheduleLocalNotification();
    }, 200),
  ).current;

  // プッシュ通知の予約
  const schedulePushNotification = async (
    reminder: Reminder,
    currentSubscription: PushSubscription | null,
  ) => {
    const currentUserId = userIdRef.current;
    console.log(
      "schedulePushNotification called for reminder:",
      reminder.id,
      "userId:",
      currentUserId,
    );
    if (!currentUserId) {
      console.log("schedulePushNotification: userId is null, throwing error.");
      throw new Error("ユーザーIDが利用できません。");
    }

    // `calculateNextScheduledNotification` を使って次の通知時刻を計算
    const nextNotification = calculateNextScheduledNotification([reminder]);
    if (!nextNotification) {
      console.log(
        "schedulePushNotification: No next notification time calculated, returning.",
      );
      // TODO: サーバー側で予約済みの通知があればキャンセルするAPIを呼ぶ
      return;
    }

    try {
      console.log(
        "schedulePushNotification: Making fetch call to /api/schedule-reminder",
      );
      const response = await fetch("/api/schedule-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          reminder: {
            userId: currentUserId,
            reminderId: reminder.id,
            message: reminder.title,
            scheduledTime: nextNotification.scheduleTime,
            url: reminder.url,
            status: reminder.status || "pending",
            subscription: currentSubscription,
            schedule: reminder.schedule,
            baseDate: reminder.baseDate,
          },
        }),
      });
      console.log(
        "schedulePushNotification: Fetch response received, status:",
        response.status,
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "不明なエラー" }));
        console.log(
          "schedulePushNotification: Response not ok, throwing error.",
        );
        throw new Error(
          `リマインダーの保存に失敗しました (Status: ${response.status}): ${errorData.message || errorData.error}`,
        );
      }
      console.log("schedulePushNotification: Fetch call successful.");
    } catch (error) {
      throw new Error(
        `リマインダーの保存に失敗しました: ${(error as Error).message}`,
      );
    }
  };

  const addReminder = async (
    reminderData: Omit<Reminder, "id" | "createdAt" | "timezone">,
  ) => {
    console.log("addReminder called with:", reminderData);
    const newReminder: Reminder = {
      ...reminderData,
      id: generateId(),
      createdAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isPaused: reminderData.isPaused || false,
    };

    setReminders((prev) => [...prev, newReminder]);
    console.log("addReminder finished, new reminder:", newReminder);

    if (settings.notifications.method === "push") {
      try {
        await schedulePushNotification(newReminder, subscription);
      } catch (error) {
        addToast(
          `プッシュ通知のスケジュールに失敗: ${getErrorMessage(error)}`,
          "error",
        );
      }
    }
    return newReminder;
  };

  const updateReminder = async (id: string, updates: Partial<Reminder>) => {
    console.log("updateReminder called for id:", id, "with updates:", updates);
    let updatedReminder: Reminder | null = null;
    setReminders((prev) => {
      const newReminders = prev.map((reminder) => {
        if (reminder.id === id) {
          updatedReminder = { ...reminder, ...updates };
          return updatedReminder;
        }
        return reminder;
      });
      console.log(
        "updateReminder finished, updated reminder:",
        updatedReminder,
      );
      return newReminders;
    });

    if (updatedReminder && settings.notifications.method === "push") {
      try {
        await schedulePushNotification(updatedReminder, subscription);
      } catch (error) {
        addToast(
          `プッシュ通知の更新に失敗: ${getErrorMessage(error)}`,
          "error",
        );
      }
    }
  };

  const deleteReminder = async (id: string) => {
    console.log("deleteReminder called for id:", id);
    setDeletingIds((prev: string[]) => [...prev, id]);
    try {
      // ローカル通知の場合は全キャンセルしてから再スケジュール
      if (
        settings.notifications.method === "local" &&
        navigator.serviceWorker.controller
      ) {
        navigator.serviceWorker.controller.postMessage({
          type: "CANCEL_ALL_REMINDERS",
        });
      }
      const currentUserId = userIdRef.current;
      // プッシュ通知の場合は、サーバーに削除を通知するAPIを呼ぶ
      if (settings.notifications.method === "push" && currentUserId) {
        try {
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
              `リマインダーの削除に失敗しました (Status: ${response.status}): ${errorData.message || errorData.error}`,
            );
          }
          console.log("deleteReminder: Server request successful for id:", id);
        } catch (error) {
          console.error(
            `[Frontend] Failed to request server to delete reminder ${id}:`,
            error,
          );
          addToast(
            `リマインダーの削除に失敗しました: ${getErrorMessage(error)}`,
            "error",
          );
        }
      }

      setReminders((prev) => prev.filter((reminder) => reminder.id !== id));
      console.log("deleteReminder finished, reminders updated.");
    } finally {
      setDeletingIds((prev: string[]) =>
        prev.filter((deletingId: string) => deletingId !== id),
      );
    }
  };

  const bulkUpdateReminders = (
    updates: Array<{ id: string; data: Partial<Reminder> }>,
  ) => {
    console.log("bulkUpdateReminders called with updates:", updates);
    const updatedReminders: Reminder[] = [];
    setReminders((prev) =>
      prev.map((reminder) => {
        const update = updates.find((u) => u.id === reminder.id);
        if (update) {
          const newReminder = { ...reminder, ...update.data };
          updatedReminders.push(newReminder);
          return newReminder;
        }
        return reminder;
      }),
    );
    // バルク更新では個別のプッシュ通知は行わない
    console.log(
      "bulkUpdateReminders finished, updated reminders count:",
      updatedReminders.length,
    );
  };

  useEffect(() => {
    console.log(
      "useReminders useEffect triggered with settings.notifications.method:",
      settings.notifications.method,
      "reminders count:",
      reminders.length,
    );
    if (settings.notifications.method === "local") {
      debouncedLocalScheduler();
    }
    // プッシュ通知の一括同期は行わない
  }, [reminders, settings.notifications.method, debouncedLocalScheduler]);
  // --- ここまで通知スケジューリングロジックをuseEffectに移動 ---

  // (元のフックの他の関数はそのまま)
  const duplicateReminder = (id: string): void => {
    const original = reminders.find((r) => r.id === id);
    if (original) {
      const reminderData: Omit<
        Reminder,
        "id" | "createdAt" | "timezone" | "lastNotified" | "pausedAt"
      > = {
        title: original.title,
        url: original.url,
        schedule: original.schedule,
        tags: original.tags,
        isPaused: original.isPaused,
      };
      addReminder({
        ...reminderData,
        title: `${original.title} (コピー)`,
      });
    }
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

  return {
    reminders,
    addReminder,
    updateReminder,
    deleteReminder,
    deletingIds,
    duplicateReminder,
    bulkUpdateReminders,
    getReminder,
    getActiveReminders,
    getPausedReminders,
    getAllTags,
    getRemindersByTag,
    searchReminders,
    getStats,
  };
};
