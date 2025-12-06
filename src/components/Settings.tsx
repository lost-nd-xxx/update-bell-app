import ConfirmationDialog from "./ConfirmationDialog";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { ToastType } from "../components/ToastMessage"; // 変更
import { useUserId } from "../contexts/UserIdContext";
import { AppSettings, Reminder, ExportData } from "../types";
import {
  downloadFile,
  isReminder,
  getErrorMessage,
  readFile,
} from "../utils/helpers";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  Trash2,
  ExternalLink,
  BarChart3,
  Book,
} from "lucide-react";
import { useState, useMemo } from "react";

interface SettingsProps {
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  importSettings: (settings: AppSettings) => {
    settings: AppSettings;
    pushNotificationFallback: boolean;
  };
  reminders: Reminder[];
  onBack: () => void;
  onImportReminders?: (
    reminders: Reminder[],
  ) => Promise<{ added: number; updated: number }>;
  onImportTheme?: (theme: "light" | "dark" | "system") => void;
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  syncRemindersToServer: () => Promise<void>;
}

interface ExtendedNavigator extends Navigator {
  standalone?: boolean;
}

const Settings: React.FC<SettingsProps> = ({
  theme,
  setTheme,
  settings,
  updateSettings,
  importSettings,
  reminders,
  onBack,
  onImportReminders,
  onImportTheme,
  addToast,
  syncRemindersToServer,
}) => {
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isSwitchingToLocalConfirmOpen, setIsSwitchingToLocalConfirmOpen] =
    useState(false);
  const [isDeletingServerData, setIsDeletingServerData] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const userId = useUserId();

  const {
    subscribeToPushNotifications,
    unsubscribeFromPushNotifications,
    isSubscribing,
    subscription,
  } = usePushNotifications(addToast);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    reminders.forEach((reminder) => {
      reminder.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [reminders]);

  const stats = {
    total: reminders.length,
    active: reminders.filter((r) => !r.isPaused).length,
    paused: reminders.filter((r) => r.isPaused).length,
    tags: allTags.length,
  };

  const exportData = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { timezone, lastTimezoneCheck, notifications, ...settingsBase } =
      settings;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { permission, enabled, ...notificationsToExport } = notifications;

    const settingsToExport = {
      ...settingsBase,
      notifications: notificationsToExport,
    };

    const data = {
      version: process.env.APP_VERSION || "1.0.0",
      exportDate: new Date().toISOString(),
      reminders,
      settings: settingsToExport,
      theme,
    };

    const filename = `update-bell-${
      new Date().toISOString().split("T")[0]
    }.json`;
    downloadFile(JSON.stringify(data, null, 2), filename);
    addToast("データをエクスポートしました", "success");
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const content = await readFile(file);
      const data = JSON.parse(content) as ExportData;

      if (!data.reminders || !Array.isArray(data.reminders)) {
        throw new Error("無効なファイル形式です");
      }

      const validReminders = data.reminders.filter(isReminder);
      const invalidCount = data.reminders.length - validReminders.length;
      let importResult = { added: 0, updated: 0 };

      if (validReminders.length > 0 && onImportReminders) {
        importResult = await onImportReminders(validReminders);
      }
      if (data.theme && onImportTheme) {
        onImportTheme(data.theme);
      }
      if (data.settings) {
        const { pushNotificationFallback } = importSettings(data.settings);
        if (pushNotificationFallback) {
          addToast(
            "プッシュ通知が利用できない、または許可されていないため、ローカル通知に切り替えました。",
            "warning",
          );
        }
      }

      let message = `インポート完了: ${importResult.added}件追加, ${importResult.updated}件更新`;
      if (invalidCount > 0) {
        message += ` (${invalidCount}件の無効なデータは除外)`;
      }
      addToast(message, "success");
    } catch (error) {
      addToast(`インポートに失敗: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      addToast("このブラウザは通知をサポートしていません", "error");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      updateSettings({
        notifications: {
          ...settings.notifications,
          permission,
          enabled: permission === "granted",
        },
      });
      if (permission === "granted") {
        addToast("通知の許可が得られました。", "success");
      }
    } catch (error) {
      addToast(
        "通知許可の取得に失敗しました: " + getErrorMessage(error),
        "error",
      );
    }
  };

  const sendTestNotification = async () => {
    if (!("serviceWorker" in navigator)) {
      addToast("このブラウザは通知をサポートしていません", "error");
      return;
    }
    try {
      // Service Workerの準備が整うのを待つ
      const registration = await navigator.serviceWorker.ready;
      if (registration.active) {
        // アクティブなService Workerにメッセージを送信
        registration.active.postMessage({
          type: "TEST_NOTIFICATION",
        });
        addToast(
          "テスト通知を送信しました。アプリを閉じてお待ちください。",
          "info",
        );
      } else {
        throw new Error("アクティブなService Workerが見つかりませんでした。");
      }
    } catch (error) {
      addToast(
        `テスト通知の送信に失敗しました: ${getErrorMessage(error)}`,
        "error",
      );
    }
  };

  const handleClearAllDataClick = () => {
    setIsDeleteConfirmOpen(true);
  };

  const confirmClearAllData = () => {
    localStorage.clear();
    location.reload();
  };

  const deleteAllUserReminders = async () => {
    if (!userId) {
      addToast("ユーザーIDが取得できませんでした。", "error");
      return;
    }
    setIsDeletingServerData(true);
    try {
      const response = await fetch("/api/delete-all-user-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        throw new Error("サーバーデータの削除に失敗しました。");
      }
      addToast("サーバー上のデータを削除しました。", "success");
    } catch (error) {
      addToast(getErrorMessage(error), "error");
    } finally {
      setIsDeletingServerData(false);
      setIsSwitchingToLocalConfirmOpen(false);
    }
  };

  const handleNotificationMethodChange = async (
    newMethod: "local" | "push",
  ) => {
    const oldMethod = settings.notifications.method;
    if (newMethod === oldMethod) return;

    if (newMethod === "local" && oldMethod === "push") {
      setIsSwitchingToLocalConfirmOpen(true);
      return; // ダイアログの応答を待つ
    }

    if (newMethod === "push") {
      // ユーザーがまだプッシュ通知を購読していない場合
      if (!subscription) {
        // 最初に購読を試みる
        const success = await subscribeToPushNotifications();
        if (!success) {
          addToast(
            "プッシュ通知の有効化がキャンセルされたか、失敗しました。",
            "error",
          );
          return; // 購読に失敗したらここで処理を中断
        }
      }

      // 購読が成功または既存の場合、同期処理へ
      setIsSyncing(true);
      try {
        await syncRemindersToServer();
        addToast("ローカルデータをサーバーに同期しました。", "success");
        // 同期成功後に設定を更新
        updateSettings({
          notifications: { ...settings.notifications, method: newMethod },
        });
      } catch (error) {
        addToast(getErrorMessage(error), "error");
      } finally {
        setIsSyncing(false);
      }
    } else {
      // localへの切り替えなど、他のケース
      updateSettings({
        notifications: { ...settings.notifications, method: newMethod },
      });
    }
  };

  const confirmSwitchToLocal = async () => {
    await deleteAllUserReminders();
    updateSettings({
      notifications: { ...settings.notifications, method: "local" },
    });
  };

  const getNotificationStatusText = (
    permission: NotificationPermission | "unsupported",
    isPushEnabled: boolean,
    isSubscribed: boolean,
  ) => {
    if (isPushEnabled) {
      if (permission === "granted") {
        return (
          <div className="flex items-center gap-2">
            <CheckCircle
              className="text-green-600 dark:text-green-400"
              size={16}
            />
            <span>
              {isSubscribed ? "許可済み (購読中)" : "許可済み (未購読)"}
            </span>
          </div>
        );
      }
    } else {
      // ローカル通知の場合
      if (permission === "granted") {
        return (
          <div className="flex items-center gap-2">
            <CheckCircle
              className="text-green-600 dark:text-green-400"
              size={16}
            />
            <span>許可済み</span>
          </div>
        );
      }
    }

    switch (permission) {
      case "denied":
        return (
          <div className="flex items-center gap-2">
            <XCircle className="text-red-600 dark:text-red-400" size={16} />
            <span>拒否済み</span>
          </div>
        );
      case "unsupported":
        return (
          <div className="flex items-center gap-2">
            <XCircle className="text-red-600 dark:text-red-400" size={16} />
            <span>非対応</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="text-yellow-600 dark:text-yellow-400"
              size={16}
            />
            <span>未設定</span>
          </div>
        );
    }
  };

  const getBrowserInfo = () => {
    const isStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;
    const extendedNavigator = window.navigator as ExtendedNavigator;
    const isPWA = isStandalone || extendedNavigator.standalone;

    return {
      isPWA,
      isStandalone,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
    };
  };

  const browserInfo = getBrowserInfo();

  return (
    <div className="max-w-2xl mx-auto">
      <ConfirmationDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmClearAllData}
        title="すべてのデータを削除"
        message={
          <>
            <p>すべてのリマインダーと設定がこのブラウザから削除されます。</p>
            <p className="font-bold text-red-600 dark:text-red-400">
              この操作は取り消せません。
            </p>
            <p>本当に続行しますか？</p>
          </>
        }
        confirmText="すべて削除"
        confirmButtonVariant="danger"
      />
      <ConfirmationDialog
        isOpen={isSwitchingToLocalConfirmOpen}
        onClose={() => setIsSwitchingToLocalConfirmOpen(false)}
        onConfirm={confirmSwitchToLocal}
        title="通知方法の変更"
        message={
          <>
            <p>
              「ローカル通知」に切り替えると、サーバーに保存されているプッシュ通知用のデータがすべて削除されます。
            </p>
            <ul className="list-disc list-inside my-2 space-y-1">
              <li>
                アプリを閉じていても通知が届く機能は利用できなくなります。
              </li>
              <li>このブラウザ内のリマインダーは削除されません。</li>
            </ul>
            <p>よろしいですか？</p>
          </>
        }
        confirmText="切り替える"
        confirmButtonVariant="danger"
        isConfirming={isDeletingServerData}
      />

      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="p-2 text-gray-600 dark:text-gray-400 rounded-full border border-gray-500/20"
          aria-label="ダッシュボードに戻る"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          設定
        </h1>
      </div>

      <div className="space-y-6">
        <div className="card p-6 rounded-lg border border-gray-200 dark:border-gray-600">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            プッシュ通知
          </h3>

          <div className="space-y-4">
            <div className="flex items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 pr-4">
                通知許可状態
              </span>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {getNotificationStatusText(
                  settings.notifications.permission,
                  settings.notifications.method === "push",
                  !!subscription,
                )}
              </div>
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                通知方法
              </label>
              <div className="mt-2 space-y-2">
                <div
                  onClick={() => handleNotificationMethodChange("local")}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    settings.notifications.method === "local"
                      ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500"
                  }`}
                >
                  <div className="flex items-center">
                    <input
                      type="radio"
                      name="notification-method"
                      id="notification-local"
                      readOnly
                      checked={settings.notifications.method === "local"}
                      className="h-4 w-4 text-purple-600 border-gray-300 focus:ring-purple-500"
                    />
                    <label htmlFor="notification-local" className="ml-3 block">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        ローカル通知 (シンプル)
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        手軽・アプリを開いている時のみ
                      </p>
                    </label>
                  </div>
                </div>

                <div
                  onClick={() => {
                    if (settings.notifications.permission === "granted") {
                      handleNotificationMethodChange("push");
                    }
                  }}
                  className={`relative p-3 rounded-lg border-2 transition-colors ${
                    settings.notifications.permission !== "granted" || isSyncing
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer"
                  } ${
                    settings.notifications.method === "push"
                      ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500"
                  }`}
                >
                  {isSyncing && (
                    <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 flex items-center justify-center rounded-lg z-10">
                      <Loader2
                        className="animate-spin text-gray-500"
                        size={24}
                      />
                    </div>
                  )}
                  <div className="flex items-center">
                    <input
                      type="radio"
                      name="notification-method"
                      id="notification-push"
                      readOnly
                      checked={settings.notifications.method === "push"}
                      disabled={
                        settings.notifications.permission !== "granted" ||
                        isSyncing
                      }
                      className="h-4 w-4 text-purple-600 border-gray-300 focus:ring-purple-500"
                    />
                    <label htmlFor="notification-push" className="ml-3 block">
                      <span
                        className={`text-sm font-medium ${settings.notifications.permission !== "granted" || isSyncing ? "text-gray-500" : "text-gray-900 dark:text-white"}`}
                      >
                        プッシュ通知 (高信頼性)
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        アプリを閉じていても届く（遅延が生じる場合があります）
                        {settings.notifications.permission !== "granted" &&
                          " (最初に通知を許可してください)"}
                      </p>
                    </label>
                  </div>
                </div>
              </div>
              {settings.notifications.method === "push" &&
                settings.notifications.permission === "granted" && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    {subscription ? (
                      <div>
                        <button
                          onClick={unsubscribeFromPushNotifications}
                          disabled={isSubscribing}
                          className="w-full sm:w-auto justify-center inline-flex items-center px-4 py-2 border-2 border-red-500 bg-red-50 dark:bg-red-900/20 text-sm font-medium rounded-lg text-red-700 dark:text-red-300 disabled:opacity-50"
                        >
                          {isSubscribing
                            ? "処理中..."
                            : "このブラウザでのプッシュ通知を無効にする"}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          より確実な通知を受け取るために、このブラウザのプッシュ通知を有効にします。
                        </p>
                        <button
                          onClick={subscribeToPushNotifications}
                          disabled={isSubscribing}
                          className="w-full sm:w-auto justify-center inline-flex items-center px-4 py-2 border-2 border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-sm font-medium rounded-lg text-purple-700 dark:text-purple-300 disabled:opacity-50"
                        >
                          {isSubscribing
                            ? "有効化しています..."
                            : "このブラウザでプッシュ通知を有効にする"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              {settings.notifications.permission === "granted" && (
                <button
                  onClick={sendTestNotification}
                  className="w-full sm:w-auto justify-center inline-flex items-center px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-sm font-medium rounded-lg text-black dark:text-white"
                >
                  通知をテスト
                </button>
              )}

              {settings.notifications.permission !== "granted" && (
                <button
                  onClick={requestNotificationPermission}
                  className="w-full sm:w-auto justify-center inline-flex items-center px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-sm font-medium rounded-lg text-black dark:text-white"
                  disabled={settings.notifications.permission === "denied"}
                >
                  通知を許可
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card p-6 rounded-lg border border-gray-200 dark:border-gray-600">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            テーマ
          </h3>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setTheme("light")}
              className={`p-3 rounded-lg border-2 transition-colors ${theme === "light" ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20" : "border-gray-200 dark:border-gray-700"}`}
            >
              <Sun className="mx-auto mb-2 text-yellow-500" size={24} />
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                ライト
              </div>
            </button>

            <button
              onClick={() => setTheme("dark")}
              className={`p-3 rounded-lg border-2 transition-colors ${theme === "dark" ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20" : "border-gray-200 dark:border-gray-700"}`}
            >
              <Moon className="mx-auto mb-2 text-blue-500" size={24} />
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                ダーク
              </div>
            </button>

            <button
              onClick={() => setTheme("system")}
              className={`p-3 rounded-lg border-2 transition-colors ${theme === "system" ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20" : "border-gray-200 dark:border-gray-700"}`}
            >
              <Monitor className="mx-auto mb-2 text-gray-500" size={24} />
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                システム
              </div>
            </button>
          </div>
        </div>

        <div className="card p-6 rounded-lg border border-gray-200 dark:border-gray-600">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            データ管理
          </h3>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex-1">
                <div className="font-medium text-black dark:text-white">
                  データエクスポート
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  すべてのリマインダーと設定をJSONファイルでダウンロード
                </div>
              </div>
              <button
                onClick={exportData}
                className="btn btn-secondary flex items-center justify-center gap-2 text-black dark:text-white rounded-lg p-2 w-full sm:w-auto border-2 border-gray-200 dark:border-gray-600"
              >
                <Download size={16} />
                エクスポート
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  データインポート
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  JSONファイルからリマインダーと設定を復元
                </div>
              </div>
              <label className="btn btn-secondary flex items-center justify-center gap-2 cursor-pointer text-black dark:text-white rounded-lg p-2 w-full sm:w-auto border-2 border-gray-200 dark:border-gray-600">
                <Upload size={16} />
                {isImporting ? "インポート中..." : "インポート"}
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  disabled={isImporting}
                  className="hidden"
                />
              </label>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex-1">
                  <div className="font-medium text-red-600 dark:text-red-400">
                    すべてのデータを削除
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    すべてのリマインダーと設定を削除します（取り消し不可）
                  </div>
                </div>
                <button
                  onClick={handleClearAllDataClick}
                  className="btn btn-danger flex items-center justify-center gap-2 text-black dark:text-white rounded-lg p-2 w-full sm:w-auto border-2 border-gray-200 dark:border-gray-600"
                >
                  <Trash2 size={16} />
                  削除
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6 rounded-lg border border-gray-200 dark:border-gray-600">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            注意事項
          </h3>

          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded">
              <div className="text-sm text-black dark:text-white">
                <p className="flex flex-row gap-2 items-center">
                  <AlertTriangle size={16} className="text-yellow-500" />
                  <strong>データ保存について</strong>
                </p>
                <p className="mt-1 text-gray-600 dark:text-gray-400">
                  このアプリはブラウザのローカルストレージを使用してデータを保存します。
                  <br />
                  ブラウザのキャッシュを削除するとデータが失われる可能性があります。
                  <br />
                  重要なデータは定期的にエクスポートしてバックアップを取ることをお勧めします。
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded">
              <div className="text-sm text-black dark:text-white">
                <p className="flex flex-row gap-2 items-center">
                  <AlertTriangle size={16} className="text-yellow-500" />
                  <strong>通知機能の制約について</strong>
                </p>
                <p className="mt-1 text-gray-600 dark:text-gray-400">
                  選択した通知方法によって制約が異なります。
                </p>
                <div className="mt-2 text-gray-600 dark:text-gray-400">
                  <strong className="block">
                    ローカル通知 (シンプル) の場合:
                  </strong>
                  <ul className="list-disc list-inside ml-2">
                    <li>
                      通知を受け取るには、アプリ（PWA）がバックグラウンドで動作している必要があります。
                    </li>
                    <li>
                      アプリを完全に終了した場合や、端末の省電力モードが強く働いている場合は、通知が届きません。
                    </li>
                  </ul>
                  <strong className="mt-2 block">
                    プッシュ通知 (高信頼性) の場合:
                  </strong>
                  <ul className="list-disc list-inside ml-2">
                    <li>
                      アプリを閉じていても通知が届きますが、OSの省電力設定などの影響を受ける場合があります。
                    </li>
                    <li>
                      GitHub
                      Actionsの実行タイミングにより、通知には数十分から数時間の遅延が生じる可能性があります。
                    </li>
                  </ul>
                  <strong className="mt-2 block">推奨事項:</strong>
                  <ul className="list-disc list-inside ml-2">
                    <li>
                      いずれの通知方法でも、PWAとしてインストールしてご利用いただくことを強く推奨します。
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 rounded">
              <div className="text-sm text-red-900 dark:text-red-200">
                <p className="flex flex-row gap-2 items-center">
                  <AlertTriangle size={16} className="text-red-500" />
                  <strong>機密情報の入力に関して</strong>
                </p>
                <p className="mt-1 text-red-700 dark:text-red-300">
                  本アプリの管理者は、デバッグ等の目的でリマインダーの内容を閲覧する可能性があります。
                  <br />
                  他人に知られて困るような個人情報や機密情報は入力しないでください。
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 rounded">
              <div className="text-sm text-yellow-900 dark:text-yellow-200">
                <p className="flex flex-row gap-2 items-center">
                  <AlertTriangle size={16} className="text-yellow-500" />
                  <strong>データ自動削除について</strong>
                </p>
                <p className="mt-1 text-yellow-700 dark:text-yellow-300">
                  最後に通知をクリックしてから半年間ご利用がない場合、リマインダーやプッシュ通知購読情報などのサーバーデータは自動的に削除されます。
                  詳細は
                  <a
                    href="https://github.com/lost-nd-xxx/update-bell-app/blob/main/docs/MANUAL.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    利用者向け説明書
                  </a>
                  <ExternalLink size={12} className="inline-block ml-1" />
                  をご確認ください。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6 rounded-lg border border-gray-200 dark:border-gray-600">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 size={20} />
            利用状況
          </h3>
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

        <div className="card p-6 rounded-lg border border-gray-200 dark:border-gray-600">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            アプリ情報
          </h3>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">
                バージョン
              </span>
              <span className="text-gray-900 dark:text-white">
                {process.env.APP_VERSION}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">作者</span>
              <span className="text-gray-900 dark:text-white">lost_nd_xxx</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">
                お問い合わせ / フィードバック
              </span>
              <div className="flex gap-4">
                <a
                  href="https://marshmallow-qa.com/lost_nd_xxx"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  マシュマロ(アカウント不要)
                  <ExternalLink size={12} />
                </a>
                <a
                  href="https://github.com/lost-nd-xxx/update-bell-app/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  GitHub Issues(要アカウント)
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">
                ソースコード
              </span>
              <a
                href="https://github.com/lost-nd-xxx/update-bell-app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                GitHub <ExternalLink size={12} />
              </a>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">
                プライバシーポリシー
              </span>
              <a
                href="https://github.com/lost-nd-xxx/update-bell-app/blob/main/docs/PRIVACY_POLICY.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                内容を確認 <ExternalLink size={12} />
              </a>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">PWA状態</span>
              <span
                className={`${browserInfo.isPWA ? "text-green-600" : "text-gray-500"}`}
              >
                {browserInfo.isPWA ? "インストール済み" : "未インストール"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">
                プラットフォーム
              </span>
              <span className="text-gray-900 dark:text-white">
                {browserInfo.platform}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">言語</span>
              <span className="text-gray-900 dark:text-white">
                {browserInfo.language}
              </span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <a
              href="https://github.com/lost-nd-xxx/update-bell-app/blob/main/THIRD-PARTY-LICENSES.md"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300 rounded-lg p-2 border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Book size={16} />
              オープンソースライセンス
              <ExternalLink size={14} className="ml-1" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
