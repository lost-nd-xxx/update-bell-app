import { useState, useEffect, useCallback, useRef } from "react";
import { Reminder, AppSettings } from "../types";
import {
  generateId,
  isReminder,
  calculateNextScheduledNotification,
  debounce,
} from "../utils/helpers";
import { usePushNotifications } from "./usePushNotifications";

export const useReminders = (settings: AppSettings, userId: string | null) => {
  const [reminders, setReminders] = useState<Reminder[]>(() => {
    const saved = localStorage.getItem("update-bell-data");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed.filter(isReminder) : [];
      } catch (error) {
        console.error("リマインダーデータの読み込みに失敗:", error);
        return [];
      }
    }
    return [];
  });

  // usePushNotificationsから現在の購読情報を取得
  const { subscription } = usePushNotifications();

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
    debounce(scheduleLocalNotification, 200),
  );

  useEffect(() => {
    debouncedLocalScheduler.current = debounce(scheduleLocalNotification, 200);
  }, [scheduleLocalNotification]);

  // プッシュ通知の予約
  const schedulePushNotification = async (
    reminder: Reminder,
    currentSubscription: PushSubscription | null,
  ) => {
    if (!userId) {
      console.error(
        "Push notification scheduling failed: User ID is not available.",
      );
      return;
    }

    // `calculateNextScheduledNotification` を使って次の通知時刻を計算
    const nextNotification = calculateNextScheduledNotification([reminder]);
    if (!nextNotification) {
      // TODO: サーバー側で予約済みの通知があればキャンセルするAPIを呼ぶ
      return;
    }

    try {
      const response = await fetch("/api/schedule-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          reminder: {
            userId,
            reminderId: reminder.id,
            message: reminder.title,
            scheduledTime: nextNotification.scheduleTime,
            url: reminder.url,
            status: reminder.status || "pending",
            subscription: currentSubscription,
            schedule: reminder.schedule,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "サーバーとの通信に失敗しました" }));
        throw new Error(errorData.error || "リマインダーの保存に失敗しました");
      }
    } catch (error) {
      console.error("Failed to schedule push notification:", error);
    }
  };

  // リマインダーの変更をハンドリングし、通知をスケジュールする
  const handleReminderChange = (changedReminders: Reminder[]) => {
    if (settings.notifications.method === "push") {
      // プッシュ通知の場合、変更された各リマインダーについて予約APIを叩く
      changedReminders.forEach((reminder) =>
        schedulePushNotification(reminder, subscription),
      );
    } else {
      // ローカル通知の場合、全リマインダーから次の通知を計算して予約する
      // この呼び出しはdebounceされているので、短期間に複数回呼ばれても効率的
      debouncedLocalScheduler.current();
    }
  };

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

    setReminders((prev) => {
      const newReminders = [...prev, newReminder];
      // handleReminderChangeを呼ぶ前にstateを更新
      handleReminderChange([newReminder]);
      return newReminders;
    });

    return newReminder;
  };

  const updateReminder = (id: string, updates: Partial<Reminder>) => {
    setReminders((prev) => {
      let updatedReminder: Reminder | null = null;
      const newReminders = prev.map((reminder) => {
        if (reminder.id === id) {
          updatedReminder = { ...reminder, ...updates };
          return updatedReminder;
        }
        return reminder;
      });

      if (updatedReminder) {
        handleReminderChange([updatedReminder]);
      }
      return newReminders;
    });
  };

  const deleteReminder = async (id: string) => {
    // async を追加
    // ローカル通知の場合は全キャンセルしてから再スケジュール
    if (
      settings.notifications.method === "local" &&
      navigator.serviceWorker.controller
    ) {
      navigator.serviceWorker.controller.postMessage({
        type: "CANCEL_ALL_REMINDERS",
      });
    }

    // プッシュ通知の場合は、サーバーに削除を通知するAPIを呼ぶ
    if (settings.notifications.method === "push" && userId) {
      try {
        const response = await fetch("/api/delete-reminder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, reminderId: id }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "サーバーとの通信に失敗しました" }));
          throw new Error(
            errorData.error || "リマインダーの削除に失敗しました",
          );
        }
      } catch (error) {
        console.error(
          `[Frontend] Failed to request server to delete reminder ${id}:`,
          error,
        );
      }
    }

    setReminders((prev) => prev.filter((reminder) => reminder.id !== id));
  };

  const bulkUpdateReminders = (
    updates: Array<{ id: string; data: Partial<Reminder> }>,
  ) => {
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
    if (updatedReminders.length > 0) {
      handleReminderChange(updatedReminders);
    }
  };

  // `reminders`が変更されたときにローカル通知を再スケジュールする
  useEffect(() => {
    if (settings.notifications.method === "local") {
      debouncedLocalScheduler.current();
    }
    // プッシュ通知の場合は、add/update時に個別にAPIを叩くので、このuseEffectでは何もしない
  }, [reminders, settings.notifications.method]);

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
