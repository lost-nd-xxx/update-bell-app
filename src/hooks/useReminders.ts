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

  // usePushNotificationsから現在の購読情報を取得
  const { subscription } = usePushNotifications(addToast);

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
    console.log(
      "schedulePushNotification called for reminder:",
      reminder.id,
      "userId:",
      userId,
    );
    if (!userId) {
      console.log("schedulePushNotification: userId is null, throwing error.");
      throw new Error("ユーザーIDが利用できません。"); // 変更
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

  const addReminder = (
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
    return newReminder;
  };

  const updateReminder = (id: string, updates: Partial<Reminder>) => {
    console.log("updateReminder called for id:", id, "with updates:", updates);
    setReminders((prev) => {
      let updatedReminder: Reminder | null = null;
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
  };

  const deleteReminder = async (id: string) => {
    console.log("deleteReminder called for id:", id);
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
  };

  const bulkUpdateReminders = (
    // async を追加
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
    console.log(
      "bulkUpdateReminders finished, updated reminders count:",
      updatedReminders.length,
    );
  };

  // --- 通知スケジューリングロジックをuseEffectに移動 ---
  const debouncedHandleReminderChange = useRef(
    debounce(async (...args: unknown[]) => {
      // async を追加
      console.log("debouncedHandleReminderChange fired");
      const remindersToProcess = args[0] as Reminder[]; // 型アサーション

      // プッシュ通知の場合、変更された各リマインダーについて予約APIを叩く
      if (settings.notifications.method === "push") {
        if (!userId) {
          // ★ ガード節を追加
          console.log(
            "debouncedHandleReminderChange: userId is null, skipping.",
          );
          return;
        }
        const errors: string[] = [];
        const successfulReminders: string[] = [];
        for (const reminder of remindersToProcess) {
          console.log(
            "Scheduling push notification for reminder:",
            reminder.id,
            "title:",
            reminder.title,
          );
          try {
            await schedulePushNotification(reminder, subscription);
            successfulReminders.push(reminder.title);
            console.log(
              "schedulePushNotification successful for reminder:",
              reminder.id,
            );
          } catch (error) {
            console.error(
              "Failed to schedule push notification in useEffect:",
              error,
            );
            errors.push(`${reminder.title}: ${getErrorMessage(error)}`);
          }
        }

        if (errors.length > 0) {
          // 複数のエラーがある場合、それぞれ個別にトースト通知として表示
          errors.forEach((err) => {
            addToast(`${err}`, "error", 20000); // 20秒表示に延長
          });

          // 成功したリマインダーがあればそれも表示
          if (successfulReminders.length > 0) {
            addToast(
              `${successfulReminders.length}件のプッシュ通知をスケジュールしました。`,
              "success",
            );
          }
        } else if (successfulReminders.length > 0) {
          // 全て成功した場合
          addToast(
            `${successfulReminders.length}件のプッシュ通知をスケジュールしました。`,
            "success",
          );
        }
      }
    }, 500), // デバウンス時間
  ).current;

  useEffect(() => {
    console.log(
      "useReminders useEffect triggered with settings.notifications.method:",
      settings.notifications.method,
      "reminders count:",
      reminders.length,
    );
    if (settings.notifications.method === "local") {
      // ローカル通知の場合、全リマインダーから次の通知を計算して予約する
      debouncedLocalScheduler();
    } else if (settings.notifications.method === "push" && userId) {
      // userIdの存在を確認
      // プッシュ通知の場合、remindersが変更されたら、debouncedHandleReminderChangeを呼ぶ
      // 全てのリマインダーについてAPIを叩き直すことになるが、現状これがシンプル
      debouncedHandleReminderChange(reminders);
    }
  }, [
    reminders,
    settings.notifications.method,
    debouncedLocalScheduler,
    debouncedHandleReminderChange,
    userId, // 依存配列にuserIdを追加
  ]);
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
