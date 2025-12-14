import React, { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Reminder, AppState, GroupByType } from "./types";
import { getErrorMessage } from "./utils/helpers";
import { useReminders } from "./hooks/useReminders";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { useTimezone } from "./hooks/useTimezone";
// import { useUserId } from "./contexts/UserIdContext"; // userIdはuseReminders内部で取得されるため、ここでは不要に
import { useToastContext } from "./contexts/ToastProvider";

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
    reminderData: Omit<Reminder, "id" | "createdAt" | "timezone">,
  ) => {
    console.log("handleReminderSave called", reminderData);
    try {
      if (appState.editingReminder) {
        await updateReminder(appState.editingReminder.id, reminderData);
        addToast("リマインダーを更新しました。", "success");
      } else {
        await addReminder(reminderData);
        addToast("リマインダーを追加しました。", "success");
      }
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
    const currentRemindersMap = new Map(reminders.map((r) => [r.id, r]));
    let addedCount = 0;
    let updatedCount = 0;

    const finalReminders: Reminder[] = [];

    importedReminders.forEach((imported) => {
      if (currentRemindersMap.has(imported.id)) {
        // 既存のリマインダーがあれば更新
        finalReminders.push({
          ...currentRemindersMap.get(imported.id),
          ...imported,
        });
        updatedCount++;
      } else {
        // なければ追加
        finalReminders.push(imported);
        addedCount++;
      }
      currentRemindersMap.delete(imported.id); // 処理済みのものをマップから削除
    });

    // まだマップに残っているものは、インポートに含まれていない既存のリマインダーなのでそのまま残す
    currentRemindersMap.forEach((r) => finalReminders.push(r));

    // overwriteRemindersを使ってリストを一括更新
    overwriteReminders(finalReminders);

    return { added: addedCount, updated: updatedCount };
  };

  const handleGroupByChange = (groupBy: GroupByType) => {
    setAppState((prev) => ({
      ...prev,
      groupBy,
    }));
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
        notificationsEnabled={settings.notifications.enabled} // notifications.enabledは常にtrueになる想定
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
            onDelete={async (id) => {
              try {
                await deleteReminder(id);
              } catch (error) {
                addToast(
                  `リマインダーの削除に失敗しました: ${getErrorMessage(error)}`,
                  "error",
                );
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
    </div>
  );
};

export default App;
