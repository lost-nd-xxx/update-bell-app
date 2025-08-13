import React, { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Reminder, AppState, ServiceWorkerMessage } from "./types";
import { useReminders } from "./hooks/useReminders";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { useTimezone } from "./hooks/useTimezone";
import Dashboard from "./components/Dashboard";
import CreateReminder from "./components/CreateReminder";
import Settings from "./components/Settings";
import TimezoneChangeDialog from "./components/TimezoneChangeDialog";
import Header from "./components/Header";

// Service Worker関連の型定義
declare global {
  interface Window {
    bellReminder?: {
      updateRemindersCache: (reminders: Reminder[]) => void;
      updateSettingsCache: (settings: unknown) => void;
      startPeriodicCheck: (interval: number) => void;
    };
  }
}

const App: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [theme, setTheme] = useTheme();
  const {
    reminders,
    addReminder,
    updateReminder,
    deleteReminder,
    bulkUpdateReminders,
  } = useReminders();
  const { timezoneChanged, handleTimezoneChange, dismissTimezoneChange } =
    useTimezone(reminders, updateReminder);

  const [appState, setAppState] = useState<AppState>({
    currentView: "dashboard",
    editingReminder: null,
    filter: {
      searchTerm: "",
      selectedTags: [],
      showPaused: true,
    },
    sort: {
      field: "lastNotified",
      order: "desc",
    },
    isLoading: false,
    error: null,
  });

  // 統計情報の表示状態
  const [statsExpanded, setStatsExpanded] = useState(false);

  // Service Worker初期化とデータ同期
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        const message = event.data as ServiceWorkerMessage;

        switch (message.type) {
          case "NOTIFICATION_SENT":
            if (message.reminderId && message.timestamp) {
              updateReminder(message.reminderId, {
                lastNotified: message.timestamp,
              });
            }
            break;
          case "NOTIFICATION_CLICKED":
            // 通知クリック時の処理（必要に応じて実装）
            break;
          case "REQUEST_REMINDERS_DATA":
            // Service WorkerからのデータRequest
            if (window.bellReminder?.updateRemindersCache) {
              window.bellReminder.updateRemindersCache(reminders);
            }
            break;
          case "REQUEST_SETTINGS_DATA":
            // Service WorkerからのSettingsRequest
            if (window.bellReminder?.updateSettingsCache) {
              window.bellReminder.updateSettingsCache(settings);
            }
            break;
        }
      });
    }
  }, [reminders, settings, updateReminder]);

  // リマインダーデータが変更された時にService Workerに同期
  useEffect(() => {
    if (reminders.length > 0 && window.bellReminder?.updateRemindersCache) {
      window.bellReminder.updateRemindersCache(reminders);
    }
  }, [reminders]);

  // 設定が変更された時にService Workerに同期
  useEffect(() => {
    if (window.bellReminder?.updateSettingsCache) {
      window.bellReminder.updateSettingsCache(settings);
    }

    // 通知間隔が変更された場合は定期チェックを再開
    if (
      settings.notificationInterval &&
      window.bellReminder?.startPeriodicCheck
    ) {
      window.bellReminder.startPeriodicCheck(settings.notificationInterval);
    }
  }, [settings]);

  const handleViewChange = (
    view: AppState["currentView"],
    editingReminder?: Reminder,
  ) => {
    setAppState((prev) => ({
      ...prev,
      currentView: view,
      editingReminder: editingReminder || null,
    }));
    // 設定画面に移動する際は統計を閉じる
    if (view === "settings") {
      setStatsExpanded(false);
    }
  };

  const handleStatsToggle = () => {
    setStatsExpanded(!statsExpanded);
  };

  const handleTitleClick = () => {
    if (appState.currentView !== "dashboard") {
      handleViewChange("dashboard");
    }
  };

  const handleReminderSave = (
    reminderData: Omit<Reminder, "id" | "createdAt" | "timezone">,
  ) => {
    if (appState.editingReminder) {
      updateReminder(appState.editingReminder.id, reminderData);
    } else {
      addReminder(reminderData);
    }
    handleViewChange("dashboard");
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

  // テーマインポート機能の追加
  const handleImportTheme = (importedTheme: "light" | "dark" | "system") => {
    setTheme(importedTheme);
  };
  // インポート機能の追加
  const handleImportReminders = (importedReminders: Reminder[]) => {
    try {
      // 既存のリマインダーとインポートされたリマインダーをマージ
      const newReminders: Reminder[] = [];
      const updates: Array<{ id: string; data: Partial<Reminder> }> = [];

      importedReminders.forEach((imported) => {
        const existing = reminders.find((r) => r.url === imported.url);

        if (existing) {
          // 既存のリマインダーを更新
          updates.push({
            id: existing.id,
            data: {
              ...imported,
              id: existing.id, // IDは保持
              createdAt: existing.createdAt, // 作成日時も保持
            },
          });
        } else {
          // 新しいリマインダーとして追加
          newReminders.push({
            ...imported,
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            createdAt: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        }
      });

      // 一括更新
      if (updates.length > 0) {
        bulkUpdateReminders(updates);
      }

      // 新規追加
      newReminders.forEach((reminder) => {
        const { ...reminderData } = reminder;
        addReminder(reminderData);
      });
    } catch (error) {
      console.error("リマインダーインポートに失敗:", error);
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors scroll-stable">
      {/* ヘッダー */}
      <Header
        onSettingsClick={() =>
          appState.currentView === "settings"
            ? handleViewChange("dashboard")
            : handleViewChange("settings")
        }
        onStatsClick={handleStatsToggle}
        onTitleClick={handleTitleClick}
        notificationsEnabled={settings.notifications.enabled}
        statsExpanded={statsExpanded}
        isSettingsView={appState.currentView === "settings"}
      />

      {/* タイムゾーン変更ダイアログ */}
      {timezoneChanged && (
        <TimezoneChangeDialog
          previousTimezone={timezoneChanged.previous}
          currentTimezone={timezoneChanged.current}
          affectedReminders={timezoneChanged.affectedReminders}
          onConfirm={handleTimezoneChange}
          onDismiss={dismissTimezoneChange}
        />
      )}

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {appState.currentView === "dashboard" && (
          <Dashboard
            reminders={reminders}
            filter={appState.filter}
            sort={appState.sort}
            onFilterChange={handleFilterChange}
            onSortChange={handleSortChange}
            onEdit={(reminder) => handleViewChange("create", reminder)}
            onDelete={deleteReminder}
            onTogglePause={(id, isPaused) =>
              updateReminder(id, {
                isPaused,
                pausedAt: isPaused ? new Date().toISOString() : null,
              })
            }
            onCreateNew={() => handleViewChange("create")}
            statsExpanded={statsExpanded}
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
          />
        )}
      </main>

      {/* フローティングアクションボタン */}
      {appState.currentView === "dashboard" && (
        <button
          onClick={() => handleViewChange("create")}
          className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-all hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="新しいリマインダーを作成"
        >
          <Plus size={24} />
        </button>
      )}
    </div>
  );
};

export default App;
