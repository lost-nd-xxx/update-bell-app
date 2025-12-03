import React, { useMemo, useState, useEffect } from "react";
import { Search, Bell, SortAsc, SortDesc, X } from "lucide-react";
import { Reminder, AppState } from "../types";
import ReminderCard from "./ReminderCard";
import TagFilter from "./TagFilter";

interface DashboardProps {
  reminders: Reminder[];
  filter: AppState["filter"];
  sort: AppState["sort"];
  onFilterChange: (filter: Partial<AppState["filter"]>) => void;
  onSortChange: (sort: Partial<AppState["sort"]>) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (id: string) => void;
  onTogglePause: (id: string, isPaused: boolean) => void;
  onCreateNew: () => void;
  notificationPermission?: string;
  onNavigateToSettings?: () => void;
  onClearAllTags: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  reminders,
  filter,
  sort,
  onFilterChange,
  onSortChange,
  onEdit,
  onDelete,
  onTogglePause,
  onCreateNew,
  notificationPermission,
  onNavigateToSettings,
}) => {
  const [showNotificationInfo, setShowNotificationInfo] = useState(false);

  useEffect(() => {
    const hasSeenInfo = localStorage.getItem(
      "update-bell-notification-info-seen",
    );
    if (!hasSeenInfo) {
      setShowNotificationInfo(true);
    }
  }, []);

  const handleDismissNotificationInfo = () => {
    localStorage.setItem("update-bell-notification-info-seen", "true");
    setShowNotificationInfo(false);
  };

  const filteredAndSortedReminders = useMemo(() => {
    const filtered = reminders.filter((reminder) => {
      const matchesSearch =
        filter.searchTerm === "" ||
        reminder.title
          .toLowerCase()
          .includes(filter.searchTerm.toLowerCase()) ||
        reminder.url.toLowerCase().includes(filter.searchTerm.toLowerCase());
      const matchesTags =
        filter.selectedTags.length === 0 ||
        filter.selectedTags.every((tag) => reminder.tags.includes(tag));
      const matchesPause = filter.showPaused || !reminder.isPaused;
      return matchesSearch && matchesTags && matchesPause;
    });

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sort.field) {
        case "lastNotified": {
          const aTime = a.lastNotified || a.createdAt;
          const bTime = b.lastNotified || b.createdAt;
          comparison = new Date(bTime).getTime() - new Date(aTime).getTime();
          break;
        }
        case "createdAt": {
          comparison =
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          break;
        }
        case "title": {
          comparison = a.title.localeCompare(b.title, "ja");
          break;
        }
        // nextNotification is not sortable anymore as it's not stored
      }
      return sort.order === "desc" ? comparison : -comparison;
    });

    return filtered;
  }, [reminders, filter, sort]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    reminders.forEach((reminder) => {
      reminder.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [reminders]);

  const toggleSortOrder = () => {
    onSortChange({ order: sort.order === "asc" ? "desc" : "asc" });
  };

  const handleSortFieldChange = (field: AppState["sort"]["field"]) => {
    onSortChange({ field });
  };

  const handleClearAllTags = () => {
    onFilterChange({ selectedTags: [] });
  };

  return (
    <div className="max-w-2xl mx-auto">
      {showNotificationInfo && reminders.length > 0 && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 relative">
          <button
            onClick={handleDismissNotificationInfo}
            className="absolute top-2 right-2 p-1 text-purple-600 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800 rounded-full border border-purple-200 dark:border-purple-800"
            aria-label="閉じる"
          >
            <X size={16} />
          </button>
          <div className="flex items-start gap-3">
            <Bell
              className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5"
              size={16}
            />
            <div className="text-sm">
              <p className="font-medium text-purple-800 dark:text-purple-300 mb-1">
                通知について
              </p>
              <p className="text-purple-700 dark:text-purple-200">
                「最終通知」は実際に通知が送信された時刻に更新されます。通知機能を利用するには、許可が必要です。
              </p>
            </div>
          </div>
        </div>
      )}

      {notificationPermission !== "granted" && reminders.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mt-4">
          <div className="flex items-start gap-3">
            <Bell
              className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5"
              size={16}
            />
            <div className="flex-1">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                リマインダーの通知を受信するには通知設定が必要です
              </p>
            </div>
            <button
              onClick={onNavigateToSettings}
              className="text-sm font-medium text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100 transition-colors underline"
            >
              設定で有効にする
            </button>
          </div>
        </div>
      )}

      <div className="card my-4">
        <div className="relative mb-1 pb-1">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={20}
          />
          <input
            type="text"
            placeholder="タイトルやURLで検索..."
            value={filter.searchTerm}
            onChange={(e) => onFilterChange({ searchTerm: e.target.value })}
            className="input pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 my-1">
          <div className="flex items-center gap-2">
            <label className="whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300">
              並び順:
            </label>
            <select
              value={sort.field}
              onChange={(e) =>
                handleSortFieldChange(
                  e.target.value as AppState["sort"]["field"],
                )
              }
              className="input text-sm"
            >
              <option value="lastNotified">最終通知日時</option>
              <option value="createdAt">作成日時</option>
              <option value="title">タイトル</option>
            </select>
            <button
              onClick={toggleSortOrder}
              className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-md border border-gray-500/20"
              title={sort.order === "asc" ? "昇順" : "降順"}
            >
              {sort.order === "asc" ? (
                <SortAsc size={16} />
              ) : (
                <SortDesc size={16} />
              )}
            </button>
          </div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={filter.showPaused}
              onChange={(e) => onFilterChange({ showPaused: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="pl-1 text-sm text-gray-700 dark:text-gray-300">
              一時停止中も表示
            </span>
          </label>
        </div>
        <TagFilter
          allTags={allTags}
          selectedTags={filter.selectedTags}
          onTagToggle={(tag) => {
            const newSelectedTags = filter.selectedTags.includes(tag)
              ? filter.selectedTags.filter((t) => t !== tag)
              : [...filter.selectedTags, tag];
            onFilterChange({ selectedTags: newSelectedTags });
          }}
          onClearAll={handleClearAllTags}
        />
      </div>

      <div className="space-y-4">
        {filteredAndSortedReminders.length === 0 ? (
          <div className="card p-12 text-center">
            <Bell className="mx-auto mb-4 text-gray-400" size={48} />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {reminders.length === 0
                ? "リマインダーがありません"
                : "フィルター条件に一致するリマインダーがありません"}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {reminders.length === 0
                ? "最初のリマインダーを作成してください"
                : "検索条件やフィルターを変更してください"}
            </p>
            {reminders.length === 0 && (
              <button
                onClick={onCreateNew}
                className="btn btn-primary text-black dark:text-white rounded-lg border border-gray-500/20 p-2"
              >
                リマインダーを作成
              </button>
            )}
          </div>
        ) : (
          filteredAndSortedReminders.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              onEdit={() => onEdit(reminder)}
              onDelete={() => onDelete(reminder.id)}
              onTogglePause={(isPaused) => onTogglePause(reminder.id, isPaused)}
            />
          ))
        )}
      </div>

      {filteredAndSortedReminders.length < reminders.length ? (
        <div className="text-center text-sm text-gray-600 dark:text-gray-400 my-2">
          {filteredAndSortedReminders.length}件中{reminders.length}件を表示
        </div>
      ) : null}
    </div>
  );
};

export default Dashboard;
