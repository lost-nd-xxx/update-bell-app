import { useState, useEffect } from "react";
import { Reminder } from "../types";
import { generateId } from "../utils/helpers";

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

  // リマインダーをlocalStorageに保存
  useEffect(() => {
    localStorage.setItem("update-bell-data", JSON.stringify(reminders));
  }, [reminders]);

  const addReminder = (
    reminderData: Omit<Reminder, "id" | "createdAt" | "timezone">,
  ) => {
    const newReminder: Reminder = {
      ...reminderData,
      id: generateId(),
      createdAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isPaused: reminderData.isPaused || false, // ← 明示的に設定
    };

    setReminders((prev) => [...prev, newReminder]);
    return newReminder;
  };

  const updateReminder = (id: string, updates: Partial<Reminder>) => {
    setReminders((prev) =>
      prev.map((reminder) =>
        reminder.id === id ? { ...reminder, ...updates } : reminder,
      ),
    );
  };

  const deleteReminder = (id: string) => {
    setReminders((prev) => prev.filter((reminder) => reminder.id !== id));
  };

  const duplicateReminder = (id: string): void => {
    const original = reminders.find((r) => r.id === id);
    if (original) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, createdAt: _createdAt, ...reminderData } = original;
      addReminder({
        // ← return を削除
        ...reminderData,
        title: `${original.title} (コピー)`,
      });
    }
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
