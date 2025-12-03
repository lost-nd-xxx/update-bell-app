import React, { useState, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { Reminder, AppState } from "./types";
import { getErrorMessage } from "./utils/helpers";
import { useReminders } from "./hooks/useReminders";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { useTimezone } from "./hooks/useTimezone";
import { useUserId } from "./contexts/UserIdContext";
import Dashboard from "./components/Dashboard";
import CreateReminder from "./components/CreateReminder";
import Settings from "./components/Settings";
import TimezoneChangeDialog from "./components/TimezoneChangeDialog";
import Header from "./components/Header";

declare global {
  interface Window {
    updateBell?: {
      debugger?: unknown;
      showLogs?: () => void;
    };
  }
}

// メッセージ内の改行を <br /> に変換してレンダリングするヘルパーコンポーネント
const RenderMessage: React.FC<{ message: string; onDismiss: () => void }> = ({ message, onDismiss }) => {
  const htmlContent = message.split('\n').join('<br />');
  return (
    <div className="flex items-start justify-between w-full" onClick={onDismiss}>
      <span className="flex-grow" dangerouslySetInnerHTML={{ __html: htmlContent }} />
      <button onClick={onDismiss} className="ml-4 flex-shrink-0 text-white opacity-75 hover:opacity-100 focus:outline-none rounded-full border border-white/50">
        <X size={16} />
      </button>
    </div>
  );
};

const App: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const userId = useUserId();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const setError = useCallback((message: string | null) => {
    setAppState((prev) => ({ ...prev, error: message }));
    setSuccessMessage(null); // エラー発生時は成功メッセージをクリア
  }, []);

  const memoizedSetSuccessMessage = useCallback(
    (message: string | null) => {
      setSuccessMessage(message);
      setAppState((prev) => ({ ...prev, error: null })); // 成功時はエラーメッセージをクリア
      if (message) {
        setTimeout(() => setSuccessMessage(null), 5000); // 5秒後にメッセージをクリア
      }
    },
    [setSuccessMessage],
  );

  const {
    reminders,
    addReminder,
    updateReminder,
    deleteReminder,
    bulkUpdateReminders,
  } = useReminders(settings, userId, setError, memoizedSetSuccessMessage);
  const [theme, setTheme] = useTheme();
  const { timezoneChanged, handleTimezoneChange, dismissTimezoneChange } =
    useTimezone(reminders, updateReminder);

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
    isLoading: false,
    error: null,
  });

  // 通知スケジューリング関連のロジックは useReminders フックに移動したため削除

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
    // async を追加
    reminderData: Omit<Reminder, "id" | "createdAt" | "timezone">,
  ) => {
    console.log("handleReminderSave called", reminderData);
    try {
      if (appState.editingReminder) {
        await updateReminder(appState.editingReminder.id, reminderData);
      } else {
        await addReminder(reminderData);
      }
      setAppState((prev) => ({ ...prev, error: null })); // 成功時はエラーをクリア
      memoizedSetSuccessMessage("リマインダーを保存しました。"); // 成功メッセージを表示
      handleViewChange("dashboard");
      console.log("handleReminderSave success");
    } catch (error) {
      console.error("handleReminderSave caught error:", error); // エラーオブジェクト全体をログに出力
      setAppState((prev) => ({ ...prev, error: (error as Error).message })); // エラーメッセージを設定
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

  const handleImportReminders = (importedReminders: Reminder[]) => {
    const importErrors: string[] = [];
    try {
      const newReminders: Reminder[] = [];
      const updates: Array<{ id: string; data: Partial<Reminder> }> = [];

      importedReminders.forEach((imported) => {
        const existing = reminders.find((r) => r.url === imported.url);

        if (existing) {
          updates.push({
            id: existing.id,
            data: {
              ...imported,
              id: existing.id,
              createdAt: imported.createdAt || existing.createdAt,
            },
          });
        } else {
          newReminders.push({
            ...imported,
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            createdAt: imported.createdAt || new Date().toISOString(),
            timezone:
              imported.timezone ||
              Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        }
      });

      if (updates.length > 0) {
        try {
          bulkUpdateReminders(updates);
        } catch (error) {
          importErrors.push(
            `既存リマインダーの更新に失敗: ${getErrorMessage(error)}`,
          );
        }
      }

      newReminders.forEach((reminder) => {
        const { ...reminderData } = reminder;
        try {
          addReminder(reminderData);
        } catch (error) {
          importErrors.push(
            `新規リマインダーの追加に失敗: ${getErrorMessage(error)}`,
          );
        }
      });

      if (importErrors.length > 0) {
        setError(
          `リマインダーのインポートに一部失敗しました:\n* ${importErrors.join("\n* ")}`,
        );
        memoizedSetSuccessMessage(null); // エラー発生時は成功メッセージをクリア
      } else if (updates.length > 0 || newReminders.length > 0) {
        memoizedSetSuccessMessage(
          `${updates.length}件更新、${newReminders.length}件追加でインポートしました。`,
        );
        setError(null); // 成功時はエラーをクリア
      } else {
        memoizedSetSuccessMessage(
          "インポートするリマインダーはありませんでした。",
        );
        setError(null); // 成功時はエラーをクリア
      }
    } catch (error) {
      console.error("リマインダーインポートに失敗:", error);
      setError(`リマインダーインポートに失敗: ${getErrorMessage(error)}`);
      memoizedSetSuccessMessage(null); // エラー発生時は成功メッセージをクリア
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
        notificationsEnabled={settings.notifications.enabled}
        isSettingsView={appState.currentView === "settings"}
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

      {appState.error && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] flex items-center">
          <RenderMessage message={appState.error} onDismiss={() => setError(null)} />
        </div>
      )}

      {successMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] flex items-center">
          <RenderMessage message={successMessage} onDismiss={() => memoizedSetSuccessMessage(null)} />
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {appState.currentView === "dashboard" && (
          <Dashboard
            reminders={reminders}
            filter={appState.filter}
            sort={appState.sort}
            onFilterChange={handleFilterChange}
            onSortChange={handleSortChange}
            onEdit={(reminder) => handleViewChange("create", reminder)}
            onDelete={async (id) => {
              try {
                await deleteReminder(id);
                setAppState((prev) => ({ ...prev, error: null })); // 成功時はエラーをクリア
              } catch (error) {
                console.error(error); // エラーオブジェクト全体をログに出力
                setAppState((prev) => ({
                  ...prev,
                  error: (error as Error).message,
                })); // エラーメッセージを設定
              }
            }}
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
          />
        )}

        {appState.currentView === "create" && (
          <CreateReminder
            editingReminder={appState.editingReminder}
            onSave={handleReminderSave}
            onCancel={() => handleViewChange("dashboard")}
          />
        )}

        {appState.currentView === "settings" && (
          <Settings
            theme={theme}
            setTheme={setTheme}
            settings={settings}
            updateSettings={updateSettings}
            reminders={reminders}
            onBack={() => handleViewChange("dashboard")}
            onImportReminders={handleImportReminders}
            onImportTheme={handleImportTheme}
            setError={setError}
            setSuccessMessage={memoizedSetSuccessMessage}
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
    </div>
  );
};

export default App;
