import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import { Reminder, AppState } from "./types";
import { useReminders } from "./hooks/useReminders";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { useTimezone } from "./hooks/useTimezone";
import Dashboard from "./components/Dashboard";
import CreateReminder from "./components/CreateReminder";
import Settings from "./components/Settings";
import TimezoneChangeDialog from "./components/TimezoneChangeDialog";
import Header from "./components/Header";
import { calculateNextScheduledNotification, debounce } from "./utils/helpers";

declare global {
  interface Window {
    updateBell?: {
      debugger?: unknown;
      showLogs?: () => void;
    };
  }
}

const App: React.FC = () => {
  const {
    reminders,
    addReminder,
    updateReminder,
    deleteReminder,
    bulkUpdateReminders,
  } = useReminders();
  const { settings, updateSettings } = useSettings();
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

  const scheduleNextNotificationCallback = useCallback(() => {
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

  const debouncedScheduleRef = useRef(
    debounce(scheduleNextNotificationCallback, 200),
  );

  useEffect(() => {
    debouncedScheduleRef.current = debounce(
      scheduleNextNotificationCallback,
      200,
    );
  }, [scheduleNextNotificationCallback]);

  useEffect(() => {
    debouncedScheduleRef.current();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_EXECUTED") {
        console.log(
          "Notification executed, rescheduling...",
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
  }, [reminders, updateReminder, debouncedScheduleRef]);

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

  const handleClearAllTags = () => {
    handleFilterChange({ selectedTags: [] });
  };

  const handleImportTheme = (importedTheme: "light" | "dark" | "system") => {
    setTheme(importedTheme);
  };

  const handleImportReminders = (importedReminders: Reminder[]) => {
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
        bulkUpdateReminders(updates);
      }

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
