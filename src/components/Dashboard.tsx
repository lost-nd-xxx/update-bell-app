import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Search,
  Bell,
  SortAsc,
  SortDesc,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Reminder, AppState, GroupByType } from "../types";
import ReminderCard from "./ReminderCard";
import TagFilter from "./TagFilter";

interface DashboardProps {
  reminders: Reminder[];
  filter: AppState["filter"];
  sort: AppState["sort"];
  groupBy: GroupByType; // 追加
  onFilterChange: (filter: Partial<AppState["filter"]>) => void;
  onSortChange: (sort: Partial<AppState["sort"]>) => void;
  onGroupByChange: (groupBy: GroupByType) => void; // 追加
  onEdit: (reminder: Reminder) => void;
  onDelete: (id: string) => void;
  onTogglePause: (id: string, isPaused: boolean) => void;
  onCreateNew: () => void;
  notificationPermission?: string;
  onNavigateToSettings?: () => void;
  onClearAllTags: () => void;
  processingIds: Record<string, "deleting" | "saving">;
  isPushSubscribed: boolean; // プッシュ通知購読状態
}

const Dashboard: React.FC<DashboardProps> = ({
  reminders,
  filter,
  sort,
  groupBy, // 追加
  onFilterChange,
  onSortChange,
  onGroupByChange, // 追加
  onEdit,
  onDelete,
  onTogglePause,
  onCreateNew,
  notificationPermission,
  onNavigateToSettings,
  processingIds,
  isPushSubscribed, // プッシュ通知購読状態
}) => {
  const [showNotificationInfo, setShowNotificationInfo] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set()); // 追加
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false); // タグフィルターの開閉状態
  const lastGroupByRef = useRef<GroupByType | undefined>(undefined); // groupByの以前の値を追跡

  const [showPushSubscriptionInfo, setShowPushSubscriptionInfo] =
    useState(false);

  useEffect(() => {
    const hasSeenInfo = localStorage.getItem(
      "update-bell-notification-info-seen",
    );
    if (!hasSeenInfo) {
      setShowNotificationInfo(true);
    }
  }, []);

  useEffect(() => {
    // プッシュ通知未購読かつ初回訪問時にバナーを表示
    const hasSeenPushInfo = localStorage.getItem(
      "update-bell-push-subscription-info-seen",
    );
    if (!isPushSubscribed && !hasSeenPushInfo) {
      setShowPushSubscriptionInfo(true);
    }
  }, [isPushSubscribed]);

  const handleDismissNotificationInfo = () => {
    localStorage.setItem("update-bell-notification-info-seen", "true");
    setShowNotificationInfo(false);
  };

  const handleDismissPushSubscriptionInfo = () => {
    localStorage.setItem("update-bell-push-subscription-info-seen", "true");
    setShowPushSubscriptionInfo(false);
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
      return matchesSearch && matchesTags;
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
        case "nextNotification": {
          // nextNotificationTime がない場合は後ろに回す
          if (!a.nextNotificationTime && !b.nextNotificationTime) {
            comparison = 0;
          } else if (!a.nextNotificationTime) {
            comparison = 1; // a を後ろに
          } else if (!b.nextNotificationTime) {
            comparison = -1; // b を後ろに
          } else {
            comparison =
              a.nextNotificationTime.getTime() -
              b.nextNotificationTime.getTime();
          }
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

  const toggleGroup = (groupKey: string) => {
    setOpenGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const handleClearAllTags = () => {
    onFilterChange({ selectedTags: [] });
    if (!isTagFilterOpen) {
      setIsTagFilterOpen(true);
    }
  };

  const groupedReminders = useMemo(() => {
    if (groupBy === "none" || filteredAndSortedReminders.length === 0) {
      return { すべて: filteredAndSortedReminders };
    }

    const groups: Record<string, Reminder[]> = {};

    filteredAndSortedReminders.forEach((reminder: Reminder) => {
      let groupKey: string = "未分類"; // デフォルト値

      switch (groupBy) {
        case "nextNotification": {
          if (reminder.isPaused || !reminder.nextNotificationTime) {
            groupKey = "一時停止中 / 通知なし";
          } else {
            const now = new Date();
            now.setHours(0, 0, 0, 0); // 今日の始まり

            const nextTime = reminder.nextNotificationTime;
            const nextTimeDate = new Date(
              nextTime.getFullYear(),
              nextTime.getMonth(),
              nextTime.getDate(),
            );

            const diffTime = nextTimeDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // 日数の差

            if (diffDays === 0) {
              groupKey = "今日";
            } else if (diffDays === 1) {
              groupKey = "明日";
            } else if (diffDays > 1 && diffDays <= 7) {
              groupKey = "今週中";
            } else if (diffDays > 7 && diffDays <= 30) {
              groupKey = "今月中";
            } else {
              groupKey = "それ以降";
            }
          }
          break;
        }
        case "tags": {
          if (reminder.tags && reminder.tags.length > 0) {
            groupKey = reminder.tags
              .sort()
              .map((tag) => `#${tag}`)
              .join(" / ");
          } else {
            groupKey = "タグなし";
          }
          break;
        }
        case "status": {
          groupKey = reminder.isPaused ? "一時停止中" : "稼働中";
          break;
        }
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(reminder);
    });

    // グループの順番を固定する (特に日付の場合)
    const orderedGroupKeys = Object.keys(groups).sort((a, b) => {
      if (groupBy === "nextNotification") {
        const order = [
          "今日",
          "明日",
          "今週中",
          "今月中",
          "それ以降",
          "一時停止中 / 通知なし",
        ];
        return order.indexOf(a) - order.indexOf(b);
      }
      if (groupBy === "status") {
        const order = ["稼働中", "一時停止中"];
        return order.indexOf(a) - order.indexOf(b);
      }
      // その他のグループはキーでソート
      return a.localeCompare(b, "ja");
    });

    const orderedGroups: Record<string, Reminder[]> = {};
    for (const key of orderedGroupKeys) {
      orderedGroups[key] = groups[key];
    }

    return orderedGroups;
  }, [filteredAndSortedReminders, groupBy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Object.keys(groupedReminders).length > 0) {
      // groupByが変更された場合、openGroupsをリセットし、新しい最初のグループを開く

      if (lastGroupByRef.current !== groupBy) {
        const firstGroupKey = Object.keys(groupedReminders)[0];

        setOpenGroups(new Set([firstGroupKey]));
      }
    } else if (Object.keys(groupedReminders).length === 0) {
      // グループがない場合はopenGroupsをクリア

      setOpenGroups(new Set());
    }

    lastGroupByRef.current = groupBy;
  }, [groupedReminders, groupBy, openGroups]);

  return (
    <div className="max-w-2xl mx-auto">
      {showPushSubscriptionInfo && !isPushSubscribed && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4 relative">
          <button
            onClick={handleDismissPushSubscriptionInfo}
            className="absolute top-2 right-2 p-1 text-blue-600 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full border border-blue-200 dark:border-blue-800"
            aria-label="閉じる"
          >
            <X size={16} />
          </button>
          <div className="flex items-start gap-3">
            <Bell
              className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
              size={20}
            />
            <div className="text-sm flex-1">
              <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                プッシュ通知の購読が必要です
              </p>
              <p className="text-blue-700 dark:text-blue-200 mb-3">
                このアプリではリマインダーの通知にプッシュ通知を使用します。リマインダーを作成・編集するには、設定画面から「プッシュ通知を有効にする」をタップしてプッシュ通知を有効にしてください。
              </p>
              <button
                onClick={onNavigateToSettings}
                className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition-colors underline"
              >
                設定画面へ
              </button>
            </div>
          </div>
        </div>
      )}

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
              <option value="nextNotification">次回通知日時</option>
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
          <div className="flex items-center gap-2">
            <label className="whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300">
              グループ:
            </label>
            <select
              value={groupBy}
              onChange={(e) => onGroupByChange(e.target.value as GroupByType)}
              className="input text-sm"
            >
              <option value="none">なし</option>
              <option value="nextNotification">次回通知日</option>
              <option value="tags">タグ</option>
              <option value="status">ステータス</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setIsTagFilterOpen(!isTagFilterOpen)}
            className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            タグで絞り込み
            {isTagFilterOpen ? (
              <ChevronUp size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
          </button>
          {filter.selectedTags.length > 0 && (
            <button
              onClick={handleClearAllTags}
              className="text-xs text-red-600 dark:text-red-400 hover:underline"
            >
              すべてクリア
            </button>
          )}
        </div>
        {isTagFilterOpen && (
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
        )}
      </div>

      <div className="space-y-4">
        {Object.keys(groupedReminders).length === 0 ? (
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
        ) : groupBy === "none" &&
          Object.keys(groupedReminders).length === 1 &&
          Object.keys(groupedReminders)[0] === "すべて" ? (
          // グルーピングが「なし」で、「すべて」の単一グループの場合、ヘッダなしで直接リマインダーを表示
          Object.values(groupedReminders)[0].map((reminder: Reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              processingIds={processingIds}
              onEdit={() => onEdit(reminder)}
              onDelete={() => onDelete(reminder.id)}
              onTogglePause={(isPaused) => onTogglePause(reminder.id, isPaused)}
            />
          ))
        ) : (
          // それ以外の場合は、グループヘッダを表示
          Object.entries(groupedReminders).map(([groupKey, groupReminders]) => (
            <div key={groupKey} className="card">
              <button
                onClick={() => {
                  if (groupReminders.length === 0) return;
                  toggleGroup(groupKey);
                }}
                className={`flex justify-between items-center w-full p-4 text-left font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  groupReminders.length === 0
                    ? "cursor-not-allowed opacity-50"
                    : ""
                }`}
              >
                <span>
                  {groupKey} ({groupReminders.length})
                </span>
                {openGroups.has(groupKey) ? (
                  <ChevronUp size={20} />
                ) : (
                  <ChevronDown size={20} />
                )}
              </button>
              {openGroups.has(groupKey) && (
                <div className="space-y-4 p-4 border-t border-gray-200 dark:border-gray-700">
                  {groupReminders.map((reminder: Reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      processingIds={processingIds}
                      onEdit={() => onEdit(reminder)}
                      onDelete={() => onDelete(reminder.id)}
                      onTogglePause={(isPaused) =>
                        onTogglePause(reminder.id, isPaused)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
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
