import React, { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Reminder, AppState, GroupByType } from "./types";
import {
  getErrorMessage,
  generateId,
  calculateNextNotificationTime,
} from "./utils/helpers";
import { useReminders } from "./hooks/useReminders";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { useTimezone } from "./hooks/useTimezone";
import { usePushNotifications } from "./contexts/PushNotificationContext";
// import { useUserId } from "./contexts/UserIdContext"; // userIdはuseReminders内部で取得されるため、ここでは不要に
import { useToastContext } from "./contexts/ToastProvider";

import Dashboard from "./components/Dashboard";
import CreateReminder from "./components/CreateReminder";
import Settings from "./components/Settings";
import TimezoneChangeDialog from "./components/TimezoneChangeDialog";
import Header from "./components/Header";
import ConfirmationDialog from "./components/ConfirmationDialog";

declare global {
  interface Window {
    updateBell?: {
      debugger?: unknown;
      showLogs?: () => void;
    };
  }
}

const App: React.FC = () => {
  const { addToast } = useToastContext();
  const { settings, updateSettings, importSettings } = useSettings(addToast);
  // const { userId } = useUserId(); // userIdはuseReminders内部で取得されるため、ここでは不要

  // useRemindersフックの呼び出しから userId 引数を削除
  const {
    reminders,
    addReminder,
    updateReminder,
    deleteReminder,
    processingIds,
    overwriteReminders,
    syncRemindersToServer,
  } = useReminders(settings, addToast);

  const [theme, setTheme] = useTheme();
  const { timezoneChanged, handleTimezoneChange, dismissTimezoneChange } =
    useTimezone(reminders, updateReminder, addToast);

  // プッシュ通知購読状態を管理（Context経由）
  const { subscription, isSupported } = usePushNotifications();

  const [appState, setAppState] = useState<AppState>({
    currentView: "dashboard",
    editingReminder: null,
    filter: {
      searchTerm: "",
      selectedTags: [],
      showPaused: false,
    },
    sort: {
      field: "lastNotified",
      order: "desc",
    },
    groupBy: "none",
    isLoading: false,
  });

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    onConfirm: () => void;
    confirmText?: string;
    confirmButtonVariant?: "primary" | "danger";
    tertiaryAction?: {
      text: string;
      onClick: () => void;
      variant?: "warning" | "default";
    };
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    // このuseEffectは、Service Workerからの `NOTIFICATION_EXECUTED` メッセージをリッスンするために残します
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_EXECUTED") {
        console.log(
          "Notification executed, updating lastNotified...",
          event.data.payload,
        );
        updateReminder(event.data.payload.executedReminderId, {
          lastNotified: new Date().toISOString(),
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [updateReminder]);

  const handleViewChange = (
    view: AppState["currentView"],
    editingReminder?: Reminder,
  ) => {
    // リマインダー作成画面への遷移時にプッシュ通知購読をチェック
    if (view === "create" && !subscription) {
      addToast(
        "リマインダーを作成するには、プッシュ通知の購読が必要です。設定画面から「プッシュ通知を有効にする」をタップしてプッシュ通知を有効にしてください。",
        "error",
        8000,
      );
      // 設定画面へ遷移
      setAppState((prev) => ({
        ...prev,
        currentView: "settings",
        editingReminder: null,
      }));
      return;
    }

    setAppState((prev) => ({
      ...prev,
      currentView: view,
      editingReminder: editingReminder || null,
    }));
  };

  const handleTitleClick = () => {
    if (appState.currentView !== "dashboard") {
      handleViewChange("dashboard");
    }
  };

  const handleReminderSave = async (
    reminderData: Omit<Reminder, "id" | "createdAt" | "timezone">,
  ) => {
    console.log("handleReminderSave called", reminderData);
    try {
      const isEditing = appState.editingReminder !== null;
      const actionText = isEditing ? "更新" : "作成";

      if (isEditing && appState.editingReminder) {
        await updateReminder(appState.editingReminder.id, reminderData);
      } else {
        await addReminder(reminderData);
      }

      // 次回通知日時のフォーマット
      let nextNotificationText = "";
      if (!reminderData.isPaused && reminderData.schedule) {
        const nextTime = calculateNextNotificationTime(
          reminderData.schedule,
          new Date(),
        );
        if (nextTime) {
          nextNotificationText = ` 次回は${nextTime.toLocaleDateString(
            "ja-JP",
            {
              month: "long",
              day: "numeric",
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
            },
          )}に通知します。`;
        }
      }

      addToast(
        `リマインダーを${actionText}しました。${nextNotificationText}`,
        "success",
      );

      handleViewChange("dashboard");
      console.log("handleReminderSave success");
    } catch (error) {
      addToast(
        `リマインダーの保存に失敗しました: ${getErrorMessage(error)}`,
        "error",
      );
    }
  };

  const handleFilterChange = (filter: Partial<AppState["filter"]>) => {
    setAppState((prev) => ({
      ...prev,
      filter: { ...prev.filter, ...filter },
    }));
  };

  const handleSortChange = (sort: Partial<AppState["sort"]>) => {
    setAppState((prev) => ({
      ...prev,
      sort: { ...prev.sort, ...sort },
    }));
  };

  const handleClearAllTags = () => {
    handleFilterChange({ selectedTags: [] });
  };

  const handleImportTheme = (importedTheme: "light" | "dark" | "system") => {
    setTheme(importedTheme);
  };

  const handleImportReminders = async (
    importedReminders: Reminder[],
  ): Promise<{ added: number; updated: number }> => {
    let addedCount = 0;
    let skippedCount = 0;

    // 重複チェック関数: タイトル、URL、スケジュールが完全一致する場合は重複とみなす
    const isDuplicate = (existing: Reminder, imported: Reminder): boolean => {
      return (
        existing.title === imported.title &&
        existing.url === imported.url &&
        JSON.stringify(existing.schedule) === JSON.stringify(imported.schedule)
      );
    };

    const newReminders: Reminder[] = [];

    importedReminders.forEach((imported) => {
      // 既存のリマインダーと重複チェック
      const hasDuplicate = reminders.some((existing) =>
        isDuplicate(existing, imported),
      );

      if (!hasDuplicate) {
        // 重複していなければ、新しいIDを割り当てて追加
        newReminders.push({
          ...imported,
          id: generateId(), // 新しいIDを生成
          lastNotified: null, // 通知履歴はリセット
          status: "pending" as const, // ステータスもリセット
        });
        addedCount++;
      } else {
        skippedCount++;
      }
    });

    // 既存のリマインダーに追加
    const finalReminders: Reminder[] = [...reminders, ...newReminders];

    // overwriteRemindersを使ってリストを一括更新
    overwriteReminders(finalReminders);

    // スキップされた重複がある場合は通知
    if (skippedCount > 0) {
      addToast(
        `${skippedCount}件の重複するリマインダーはスキップされました。`,
        "info",
      );
    }

    return { added: addedCount, updated: 0 };
  };

  const handleGroupByChange = (groupBy: GroupByType) => {
    setAppState((prev) => ({
      ...prev,
      groupBy,
    }));
  };

  const handleDelete = (id: string) => {
    const reminderToDelete = reminders.find((r) => r.id === id);
    if (!reminderToDelete) return;

    // 一時停止中かどうかで削除確認モーダルを出し分ける
    if (reminderToDelete.isPaused) {
      // 一時停止中: 2ボタン（削除/キャンセル）
      setConfirmDialog({
        isOpen: true,
        title: `「${reminderToDelete.title}」を削除しますか？`,
        message: "この操作は取り消せません。",
        onConfirm: async () => {
          try {
            await deleteReminder(id);
            setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
            addToast("リマインダーを削除しました。", "success");
          } catch (error) {
            addToast(
              `リマインダーの削除に失敗しました: ${getErrorMessage(error)}`,
              "error",
            );
          }
        },
        confirmText: "削除",
        confirmButtonVariant: "danger",
        // tertiaryActionなし（2ボタン）
      });
    } else {
      // 稼働中: 3ボタン（削除/一時停止/キャンセル）
      setConfirmDialog({
        isOpen: true,
        title: `「${reminderToDelete.title}」を削除しますか？`,
        message: (
          <>
            この操作は取り消せません。
            <br />
            通知を一時的に止めたい場合は「一時停止」をご利用ください。
          </>
        ),
        onConfirm: async () => {
          try {
            await deleteReminder(id);
            setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
            addToast("リマインダーを削除しました。", "success");
          } catch (error) {
            addToast(
              `リマインダーの削除に失敗しました: ${getErrorMessage(error)}`,
              "error",
            );
          }
        },
        confirmText: "削除",
        confirmButtonVariant: "danger",
        tertiaryAction: {
          text: "一時停止",
          onClick: () => {
            setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
            updateReminder(id, {
              isPaused: true,
              pausedAt: new Date().toISOString(),
            });
            addToast("リマインダーを一時停止しました。", "success");
          },
          variant: "warning",
        },
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors scroll-stable">
      <Header
        onSettingsClick={() =>
          appState.currentView === "settings"
            ? handleViewChange("dashboard")
            : handleViewChange("settings")
        }
        onTitleClick={handleTitleClick}
        isSettingsView={appState.currentView === "settings"}
        isSubscribed={!!subscription}
      />

      {timezoneChanged && (
        <TimezoneChangeDialog
          previousTimezone={timezoneChanged.previous}
          currentTimezone={timezoneChanged.current}
          affectedReminders={timezoneChanged.affectedReminders}
          onConfirm={handleTimezoneChange}
          onDismiss={dismissTimezoneChange}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {appState.currentView === "dashboard" && (
          <Dashboard
            reminders={reminders}
            filter={appState.filter}
            sort={appState.sort}
            groupBy={appState.groupBy}
            processingIds={processingIds}
            onFilterChange={handleFilterChange}
            onSortChange={handleSortChange}
            onGroupByChange={handleGroupByChange}
            onEdit={(reminder) => handleViewChange("create", reminder)}
            onDelete={handleDelete}
            onTogglePause={(id, isPaused) =>
              updateReminder(id, {
                isPaused,
                pausedAt: isPaused ? new Date().toISOString() : null,
              })
            }
            onCreateNew={() => handleViewChange("create")}
            notificationPermission={settings.notifications.permission}
            onNavigateToSettings={() => handleViewChange("settings")}
            onClearAllTags={handleClearAllTags}
            isPushSubscribed={!!subscription}
            isNotificationSupported={isSupported}
          />
        )}

        {appState.currentView === "create" && (
          <CreateReminder
            editingReminder={appState.editingReminder}
            onSave={handleReminderSave}
            onCancel={() => handleViewChange("dashboard")}
            processingIds={processingIds}
            totalReminders={reminders.length}
          />
        )}

        {appState.currentView === "settings" && (
          <Settings
            theme={theme}
            setTheme={setTheme}
            settings={settings}
            updateSettings={updateSettings}
            importSettings={importSettings}
            reminders={reminders}
            onBack={() => handleViewChange("dashboard")}
            onImportReminders={handleImportReminders}
            onImportTheme={handleImportTheme}
            addToast={addToast}
            syncRemindersToServer={syncRemindersToServer}
          />
        )}
      </main>

      {appState.currentView === "dashboard" && (
        <button
          onClick={() => handleViewChange("create")}
          className="fixed bottom-6 right-6 bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg transition-all hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
          aria-label="新しいリマインダーを作成"
        >
          <Plus size={24} />
        </button>
      )}

      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        confirmButtonVariant={confirmDialog.confirmButtonVariant}
        tertiaryAction={confirmDialog.tertiaryAction}
      />
    </div>
  );
};

export default App;
