import React, { useMemo } from "react";
import { Search, Bell, SortAsc, SortDesc, BarChart3 } from "lucide-react";
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
  statsExpanded: boolean;
  // 通知設定導線強化のために追加
  notificationPermission?: string;
  onNavigateToSettings?: () => void;
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
  statsExpanded,
  notificationPermission,
  onNavigateToSettings,
}) => {
  // フィルタリングとソート処理
  const filteredAndSortedReminders = useMemo(() => {
    const filtered = reminders.filter((reminder) => {
      // 検索フィルター
      const matchesSearch =
        filter.searchTerm === "" ||
        reminder.title
          .toLowerCase()
          .includes(filter.searchTerm.toLowerCase()) ||
        reminder.url.toLowerCase().includes(filter.searchTerm.toLowerCase());

      // タグフィルター
      const matchesTags =
        filter.selectedTags.length === 0 ||
        filter.selectedTags.every((tag) => reminder.tags.includes(tag));

      // 一時停止フィルター
      const matchesPause = filter.showPaused || !reminder.isPaused;

      return matchesSearch && matchesTags && matchesPause;
    });

    // ソート処理
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case "lastNotified": {
          const aTime = a.lastNotified || a.createdAt;
          const bTime = b.lastNotified || b.createdAt;
          comparison = new Date(bTime).getTime() - new Date(aTime).getTime();
          break;
        }
        case "nextNotification": {
          // 次回通知時刻でソート（実装は複雑になるため簡略化）
          comparison = a.schedule.hour - b.schedule.hour;
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
      }

      return sort.order === "desc" ? comparison : -comparison;
    });

    return filtered;
  }, [reminders, filter, sort]);

  // 全てのタグを取得
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

  const stats = {
    total: reminders.length,
    active: reminders.filter((r) => !r.isPaused).length,
    paused: reminders.filter((r) => r.isPaused).length,
    tags: allTags.length,
  };

  return (
    <div className="space-y-6">
      {/* 通知設定案内バナー */}
      {notificationPermission !== "granted" && reminders.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
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

      {/* ヘッダー制御の統計情報表示 */}
      {statsExpanded && (
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center gap-3 mb-4">
            <BarChart3
              className="text-purple-600 dark:text-purple-400"
              size={24}
            />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              統計情報
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {stats.total}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                総リマインダー数
              </div>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {stats.active}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                稼働中
              </div>
            </div>
            <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {stats.paused}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                一時停止中
              </div>
            </div>
            <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {stats.tags}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                タグ数
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 通知についての説明 */}
      {reminders.length > 0 && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
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
                「最終通知」は実際に通知が送信された時刻に更新されます。通知許可と定期チェックが有効になっている必要があります。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 検索・フィルター */}
      <div className="card p-6">
        <div className="space-y-4">
          {/* 検索バー */}
          <div className="relative">
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

          {/* フィルターオプション */}
          <div className="flex flex-wrap items-center gap-4">
            {/* ソート設定 */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                <option value="nextNotification">次回通知日時</option>
                <option value="createdAt">作成日時</option>
                <option value="title">タイトル</option>
              </select>
              <button
                onClick={toggleSortOrder}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                title={sort.order === "asc" ? "昇順" : "降順"}
              >
                {sort.order === "asc" ? (
                  <SortAsc size={16} />
                ) : (
                  <SortDesc size={16} />
                )}
              </button>
            </div>

            {/* 一時停止フィルター */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filter.showPaused}
                onChange={(e) =>
                  onFilterChange({ showPaused: e.target.checked })
                }
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                一時停止中も表示
              </span>
            </label>
          </div>

          {/* タグフィルター */}
          {allTags.length > 0 && (
            <TagFilter
              allTags={allTags}
              selectedTags={filter.selectedTags}
              onTagToggle={(tag) => {
                const newSelectedTags = filter.selectedTags.includes(tag)
                  ? filter.selectedTags.filter((t) => t !== tag)
                  : [...filter.selectedTags, tag];
                onFilterChange({ selectedTags: newSelectedTags });
              }}
            />
          )}
        </div>
      </div>

      {/* リマインダー一覧 */}
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
                className="btn btn-primary text-white"
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

      {/* 検索結果の情報 */}
      {filter.searchTerm ||
      filter.selectedTags.length > 0 ||
      !filter.showPaused ? (
        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          {filteredAndSortedReminders.length}件中{reminders.length}件を表示
        </div>
      ) : null}
    </div>
  );
};

export default Dashboard;
