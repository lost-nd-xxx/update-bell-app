import React, { useState, useEffect } from "react";
import { X, Plus, AlertTriangle, Clock } from "lucide-react";
import { Reminder, Schedule, DateFilterType, ScheduleType } from "../types";
import {
  isValidUrl,
  normalizeUrl,
  generateScheduleDescription,
  calculateNextNotificationTime,
  getDayName,
  getWeekName,
} from "../utils/helpers";

interface CreateReminderProps {
  editingReminder?: Reminder | null;
  onSave: (reminder: Omit<Reminder, "id" | "createdAt" | "timezone">) => void;
  onCancel: () => void;
}

const CreateReminder: React.FC<CreateReminderProps> = ({
  editingReminder,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState({
    title: "",
    url: "",
    schedule: {
      type: "weekly" as ScheduleType,
      dayOfWeek: 1,
      hour: 10,
      minute: 0,
      interval: 1,
      weekOfMonth: 1,
      dateFilter: "all" as DateFilterType,
      selectedDays: [1],
    } as Schedule & { selectedDays: number[] },
    tags: [] as string[],
    isPaused: false,
  });

  const [tagInput, setTagInput] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hourInput, setHourInput] = useState("10");
  const [minuteInput, setMinuteInput] = useState("00");

  useEffect(() => {
    if (editingReminder) {
      setFormData({
        title: editingReminder.title,
        url: editingReminder.url,
        schedule: {
          ...editingReminder.schedule,
          selectedDays:
            editingReminder.schedule.selectedDays ||
            (editingReminder.schedule.dayOfWeek !== undefined
              ? [editingReminder.schedule.dayOfWeek]
              : [1]),
        },
        tags: [...editingReminder.tags],
        isPaused: editingReminder.isPaused,
      });
      setHourInput(editingReminder.schedule.hour.toString().padStart(2, "0"));
      setMinuteInput(
        editingReminder.schedule.minute.toString().padStart(2, "0"),
      );
    } else {
      // 新規作成時のデフォルト値を設定
      const now = new Date();
      now.setMinutes(now.getMinutes() + 10);
      const defaultHour = now.getHours();
      const defaultMinute = Math.floor(now.getMinutes() / 10) * 10;
      setFormData((prev) => ({
        ...prev,
        schedule: {
          ...prev.schedule,
          hour: defaultHour,
          minute: defaultMinute,
        },
      }));
      setHourInput(defaultHour.toString().padStart(2, "0"));
      setMinuteInput(defaultMinute.toString().padStart(2, "0"));
    }
  }, [editingReminder]);

  useEffect(() => {
    const newWarnings: string[] = [];

    if (
      formData.schedule.type === "monthly" &&
      formData.schedule.weekOfMonth &&
      formData.schedule.weekOfMonth >= 5 &&
      formData.schedule.dayOfWeek !== undefined
    ) {
      const dayName = getDayName(formData.schedule.dayOfWeek);
      newWarnings.push(
        `第5${dayName}曜日は存在しない月があります。該当しない月はスキップされます。`,
      );
    }

    setWarnings(newWarnings);
  }, [
    formData.schedule.type,
    formData.schedule.weekOfMonth,
    formData.schedule.dayOfWeek,
  ]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = "タイトルは必須です";
    }

    if (!formData.url.trim()) {
      newErrors.url = "URLは必須です";
    } else if (!isValidUrl(normalizeUrl(formData.url))) {
      newErrors.url = "有効なURLを入力してください";
    }

    if (formData.schedule.hour < 0 || formData.schedule.hour > 23) {
      newErrors.hour = "時間は0-23の範囲で入力してください";
    }

    if (formData.schedule.minute < 0 || formData.schedule.minute > 59) {
      newErrors.minute = "分は0-59の範囲で入力してください";
    }

    if (formData.schedule.interval < 1) {
      newErrors.interval = "間隔は1以上で入力してください";
    }

    if (
      formData.schedule.type === "specific_days" &&
      (!formData.schedule.selectedDays ||
        formData.schedule.selectedDays.length === 0)
    ) {
      newErrors.selectedDays = "曜日を1つ以上選択してください";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    let scheduleToSave: Omit<Schedule, "selectedDays"> & {
      selectedDays?: number[];
    };

    if (formData.schedule.type === "specific_days") {
      // If it's specific_days, include selectedDays
      scheduleToSave = formData.schedule;
    } else {
      // For other types, explicitly create an object without selectedDays
      const tempSchedule: Partial<Schedule> = { ...formData.schedule };
      delete tempSchedule.selectedDays; // Remove the property if it exists
      scheduleToSave = tempSchedule as Omit<Schedule, "selectedDays">; // Cast to desired type
    }

    const reminderData = {
      title: formData.title,
      url: normalizeUrl(formData.url),
      tags: formData.tags,
      isPaused: formData.isPaused,
      schedule: scheduleToSave,
      lastNotified: editingReminder?.lastNotified || null,
      pausedAt: formData.isPaused
        ? editingReminder?.pausedAt || new Date().toISOString()
        : null,
    };

    onSave(reminderData);
  };

  const updateSchedule = (updates: Partial<Schedule>) => {
    setFormData((prev) => ({
      ...prev,
      schedule: { ...prev.schedule, ...updates },
    }));
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, tag],
      }));
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDayToggle = (day: number) => {
    const selectedDays = formData.schedule.selectedDays || [];
    const newSelectedDays = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day];
    updateSchedule({ selectedDays: newSelectedDays });
  };

  const nextNotificationTime = calculateNextNotificationTime(formData.schedule);

  return (
    <div className="card p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {editingReminder ? "リマインダーを編集" : "新しいリマインダー"}
        </h2>
        <button
          onClick={onCancel}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-full border border-gray-500/50"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              タイトル *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              className={`input ${errors.title ? "border-red-500" : ""}`}
              placeholder="例: 新商品情報、ブログ更新など"
              onKeyPress={handleKeyPress}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.title}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              URL *
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, url: e.target.value }))
              }
              className={`input ${errors.url ? "border-red-500" : ""}`}
              placeholder="https://example.com/news"
              onKeyPress={handleKeyPress}
            />
            {errors.url && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.url}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            通知設定
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              通知周期
            </label>
            <select
              value={formData.schedule.type}
              onChange={(e) =>
                updateSchedule({ type: e.target.value as Schedule["type"] })
              }
              className="input"
            >
              <option value="daily">毎日</option>
              <option value="interval">数日ごと</option>
              <option value="weekly">毎週〇曜日</option>
              <option value="specific_days">毎週〇曜日（複数）</option>
              <option value="monthly">毎月第〇週〇曜日</option>
            </select>
          </div>

          {formData.schedule.type === "daily" && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              毎日指定した時刻に通知されます。
            </div>
          )}

          {formData.schedule.type === "interval" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                間隔（日数）
              </label>
              <input
                type="number"
                min="2"
                max="365"
                value={formData.schedule.interval}
                onChange={(e) =>
                  updateSchedule({ interval: parseInt(e.target.value) || 2 })
                }
                className={`input ${errors.interval ? "border-red-500" : ""}`}
              />
              {errors.interval && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.interval}
                </p>
              )}
            </div>
          )}

          {formData.schedule.type === "weekly" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  曜日
                </label>
                <select
                  value={formData.schedule.dayOfWeek || 1}
                  onChange={(e) =>
                    updateSchedule({ dayOfWeek: parseInt(e.target.value) })
                  }
                  className="input"
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                    <option key={day} value={day}>
                      {getDayName(day)}曜日
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  間隔（週）
                </label>
                <input
                  type="number"
                  min="1"
                  max="52"
                  value={formData.schedule.interval}
                  onChange={(e) =>
                    updateSchedule({ interval: parseInt(e.target.value) || 1 })
                  }
                  className={`input ${errors.interval ? "border-red-500" : ""}`}
                />
                {errors.interval && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.interval}
                  </p>
                )}
              </div>
            </div>
          )}

          {formData.schedule.type === "specific_days" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                曜日（複数選択可）
              </label>
              <div className="grid grid-cols-7 gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                  <label
                    key={day}
                    className={`flex items-center justify-center p-2 rounded border cursor-pointer transition-colors ${
                      formData.schedule.selectedDays?.includes(day)
                        ? "bg-purple-100 border-purple-500 text-purple-700 dark:bg-purple-900/30 dark:border-purple-400 dark:text-purple-300"
                        : "border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500 text-gray-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.schedule.selectedDays?.includes(day)}
                      onChange={() => handleDayToggle(day)}
                      className="sr-only"
                    />
                    <span className="text-sm">{getDayName(day)}</span>
                  </label>
                ))}
              </div>
              {errors.selectedDays && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {errors.selectedDays}
                </p>
              )}
            </div>
          )}

          {formData.schedule.type === "monthly" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  第何週
                </label>
                <select
                  value={formData.schedule.weekOfMonth || 1}
                  onChange={(e) =>
                    updateSchedule({ weekOfMonth: parseInt(e.target.value) })
                  }
                  className="input"
                >
                  {[1, 2, 3, 4].map((week) => (
                    <option key={week} value={week}>
                      {getWeekName(week)}週
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  曜日
                </label>
                <select
                  value={formData.schedule.dayOfWeek || 1}
                  onChange={(e) =>
                    updateSchedule({ dayOfWeek: parseInt(e.target.value) })
                  }
                  className="input"
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                    <option key={day} value={day}>
                      {getDayName(day)}曜日
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              通知時刻
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={hourInput}
                  onChange={(e) => setHourInput(e.target.value)}
                  onBlur={() => {
                    const hour = Math.max(
                      0,
                      Math.min(23, parseInt(hourInput, 10) || 0),
                    );
                    setHourInput(hour.toString().padStart(2, "0"));
                    updateSchedule({ hour });
                  }}
                  className={`input w-20 text-center ${errors.hour ? "border-red-500" : ""}`}
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  時
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={minuteInput}
                  onChange={(e) => setMinuteInput(e.target.value)}
                  onBlur={() => {
                    const minute = Math.max(
                      0,
                      Math.min(59, parseInt(minuteInput, 10) || 0),
                    );
                    setMinuteInput(minute.toString().padStart(2, "0"));
                    updateSchedule({ minute });
                  }}
                  className={`input w-20 text-center ${errors.minute ? "border-red-500" : ""}`}
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  分
                </span>
              </div>
            </div>
            {(errors.hour || errors.minute) && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.hour || errors.minute}
              </p>
            )}
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Clock
              className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5"
              size={16}
            />
            <div className="flex-1">
              <h4 className="font-medium text-purple-800 dark:text-purple-300 mb-1">
                設定内容確認
              </h4>
              <p className="text-sm text-purple-700 dark:text-purple-200 mb-2">
                {generateScheduleDescription(formData.schedule)}
              </p>
              {nextNotificationTime && (
                <p className="text-sm text-purple-600 dark:text-purple-300">
                  次回通知予定:{" "}
                  {nextNotificationTime.toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    weekday: "short",
                  })}
                </p>
              )}
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="mt-3 flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
              <AlertTriangle
                className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5"
                size={16}
              />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                {warnings.map((warning, index) => (
                  <p key={index}>{warning}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            タグ
          </label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="input flex-1"
              placeholder="タグを追加"
            />
            <button
              type="button"
              onClick={addTag}
              className="btn btn-secondary text-white rounded-full border border-gray-500/20 p-1"
              disabled={!tagInput.trim()}
            >
              <Plus size={16} />
            </button>
          </div>

          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-3 py-1 rounded-full text-sm"
                >
                  #{tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 ml-1"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isPaused}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, isPaused: e.target.checked }))
              }
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              一時停止状態で作成
            </span>
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            一時停止中は通知が送信されません
          </p>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            onClick={handleSubmit}
            className="btn btn-primary flex-1 text-black dark:text-white font-bold rounded-lg border border-gray-500/20 pt-4 pb-4"
          >
            {editingReminder ? "更新" : "作成"}
          </button>
          <button
            onClick={onCancel}
            className="btn btn-secondary flex-1 text-black dark:text-white font-bold rounded-lg border border-gray-500/20 pt-4 pb-4"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateReminder;
