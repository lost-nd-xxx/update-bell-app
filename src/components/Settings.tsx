import ConfirmationDialog from "./ConfirmationDialog";
import { usePushNotifications } from "../contexts/PushNotificationContext";
import { ToastType } from "../components/ToastMessage";
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
  reminders,
  onBack,
  onImportReminders,
  onImportTheme,
  addToast,
  syncRemindersToServer,
}) => {
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeletingServerData, setIsDeletingServerData] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { userId, getAuthHeaders } = useUserId();

  const {
    subscribeToPushNotifications,
    unsubscribeFromPushNotifications,
    subscription,
  } = usePushNotifications();

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
    const settingsToExport = {
      ...settingsBase,
    };

    // リマインダーからID、通知履歴、ステータスなどの内部状態を除外
    const remindersToExport = reminders.map((reminder) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, lastNotified, status, createdAt, ...reminderData } = reminder;
      return reminderData;
    });

    const data = {
      version: process.env.APP_VERSION || "1.0.0",
      exportDate: new Date().toISOString(),
      reminders: remindersToExport,
      settings: settingsToExport,
    };

    const filename = `update-bell-${
      new Date().toISOString().split("T")[0]
    }.json`;
    downloadFile(JSON.stringify(data, null, 2), filename);
    addToast("データをエクスポートしました", "success");
  };

  const handleImportClick = (event: React.MouseEvent<HTMLLabelElement>) => {
    // オフライン時はインポートを禁止
    if (!navigator.onLine) {
      event.preventDefault();
      addToast(
        "データのインポートにはオンライン接続が必要です。インターネットに接続してから再度お試しください。",
        "error",
      );
      return;
    }

    // プッシュ通知未購読時はインポートを禁止
    if (!subscription) {
      event.preventDefault();
      addToast(
        "データのインポートにはプッシュ通知の購読が必要です。「プッシュ通知を有効にする」をタップしてプッシュ通知を有効にしてください。",
        "error",
      );
      return;
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const content = await readFile(file);
      const data = JSON.parse(content) as ExportData;

      if (!data.reminders || !Array.isArray(data.reminders)) {
        throw new Error("無効なファイル形式です。");
      }

      // --- リマインダーのインポート ---
      const validReminders = data.reminders.filter(isReminder);
      const invalidCount = data.reminders.length - validReminders.length;
      if (validReminders.length > 0 && onImportReminders) {
        const { added, updated } = await onImportReminders(validReminders);
        let message = `インポート完了: ${added}件追加, ${updated}件更新`;
        if (invalidCount > 0) {
          message += ` (${invalidCount}件の無効なデータは除外)`;
        }
        addToast(message, "success");
      } else if (invalidCount > 0) {
        addToast(`${invalidCount}件の無効なデータは除外されました。`, "info");
      }

      // --- 設定のインポート (通知方法は除く) ---
      if (data.settings) {
        const {
          notifications: _notifications,
          theme: importedTheme,
          ...otherSettings
        } = data.settings;
        updateSettings(otherSettings);

        // テーマのインポート
        if (importedTheme && onImportTheme) {
          onImportTheme(importedTheme);
        }
      }

      // --- 後方互換性: 旧形式のエクスポート（トップレベルのtheme）にも対応 ---
      if (data.theme && onImportTheme) {
        onImportTheme(data.theme);
      }

      // --- 必要であればサーバー同期 ---
      // ローカル通知オプション削除に伴い、常にPush通知（サーバー同期）を前提
      await syncRemindersToServer();
      addToast("インポート内容をサーバーと同期しました。", "info");
    } catch (error) {
      addToast(`インポート処理に失敗: ${getErrorMessage(error)}`, "error");
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
        // 通知許可が得られたらプッシュ通知を購読する
        setIsSyncing(true);
        try {
          const sub = await subscribeToPushNotifications();

          if (sub) {
            try {
              await syncRemindersToServer(); // 同期も行う
              addToast(
                "プッシュ通知を有効にし、データを同期しました。",
                "success",
              );
            } catch (syncError) {
              console.error("Sync failed:", syncError);
              addToast(
                "プッシュ通知は有効になりましたが、データの同期に失敗しました。",
                "warning",
              );
            }
          }
        } catch (error) {
          addToast(
            `プッシュ通知の購読に失敗しました: ${getErrorMessage(error)}`,
            "error",
          );
        } finally {
          setIsSyncing(false);
        }
      }
    } catch (error) {
      addToast(
        "通知許可の取得に失敗しました: " + getErrorMessage(error),
        "error",
      );
    }
  };

  const sendTestNotification = async () => {
    if (
      !("serviceWorker" in navigator) ||
      !navigator.serviceWorker.controller
    ) {
      addToast(
        "このブラウザはService Workerをサポートしていないか、有効ではありません。",
        "error",
      );
      return;
    }

    // Service Workerの準備が整うのを待つ
    const registration = await navigator.serviceWorker.ready;
    if (registration.active) {
      // アクティブなService Workerにメッセージを送信
      registration.active.postMessage({
        type: "TEST_NOTIFICATION",
      });
      addToast(
        "テスト通知を送信しました。ブラウザの通知をご確認ください。",
        "info",
      );
    } else {
      addToast("アクティブなService Workerが見つかりませんでした。", "error");
    }
  };

  const handleClearAllDataClick = () => {
    setIsDeleteConfirmOpen(true);
  };

  const confirmClearAllData = async () => {
    setIsDeletingServerData(true);
    try {
      // 1. サーバー上のデータを削除
      if (userId) {
        const requestBody = { userId };
        const authHeaders = await getAuthHeaders(requestBody);

        await fetch("/api/delete-all-user-reminders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeaders as Record<string, string>),
          },
          body: JSON.stringify(requestBody),
        }).catch((e) => console.error("Failed to delete server data:", e));
      }

      // 2. ブラウザの購読解除
      if (subscription) {
        await unsubscribeFromPushNotifications().catch((e) =>
          console.error("Failed to unsubscribe:", e),
        );
      }

      // 3. ローカルデータ削除 & リロード
      localStorage.clear();
      location.reload();
    } catch (error) {
      console.error("Error during clear all data:", error);
      // エラーでもローカルは消す
      localStorage.clear();
      location.reload();
    } finally {
      setIsDeletingServerData(false);
    }
  };

  const getNotificationStatusText = (
    permission: NotificationPermission | "unsupported",
    isSubscribed: boolean,
  ) => {
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
      default: // "default" or "prompt"
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
        isConfirming={isDeletingServerData}
      />
      {/* ローカル通知廃止に伴い、isSwitchingToLocalConfirmOpen関連のダイアログは削除 */}
      {/* 
      // 以前のコードのコメントアウト部分
      // <ConfirmationDialog
      //   isOpen={isSwitchingToLocalConfirmOpen}
      //   onClose={() => setIsSwitchingToLocalConfirmOpen(false)}
      //   onConfirm={confirmSwitchToLocal}
      //   title="通知方法の変更"
      //   message={
      //     <>
      //       <p>
      //         「ローカル通知」に切り替えると、サーバーに保存されているプッシュ通知用のデータがすべて削除されます。
      //       </p>
      //       <ul className="list-disc list-inside my-2 space-y-1">
      //         <li>
      //           アプリを閉じていても通知が届く機能は利用できなくなります。
      //         </li>
      //         <li>このブラウザ内のリマインダーは削除されません。</li>
      //       </ul>
      //       <p>よろしいですか？</p>
      //     </>
      //   }
      //   confirmText="切り替える"
      //   confirmButtonVariant="danger"
      //   isConfirming={isDeletingServerData}
      // />
       */}

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
                  !!subscription,
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              {settings.notifications.permission === "granted" &&
                subscription && (
                  <button
                    onClick={sendTestNotification}
                    className="w-full sm:w-auto justify-center inline-flex items-center px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-sm font-medium rounded-lg text-black dark:text-white"
                  >
                    通知をテスト
                  </button>
                )}

              {/* 許可済みだが未購読（ローカル通知からの移行など）の場合 */}
              {settings.notifications.permission === "granted" &&
                !subscription && (
                  <button
                    onClick={requestNotificationPermission}
                    className="w-full sm:w-auto justify-center inline-flex items-center px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-sm font-medium rounded-lg text-black dark:text-white"
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="animate-spin mr-2" size={16} />
                    ) : null}
                    プッシュ通知を有効にする
                  </button>
                )}

              {settings.notifications.permission !== "granted" && (
                <button
                  onClick={requestNotificationPermission}
                  className="w-full sm:w-auto justify-center inline-flex items-center px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-sm font-medium rounded-lg text-black dark:text-white"
                  disabled={
                    settings.notifications.permission === "denied" || isSyncing
                  }
                >
                  {isSyncing ? (
                    <Loader2 className="animate-spin mr-2" size={16} />
                  ) : null}
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
              <label
                onClick={handleImportClick}
                className="btn btn-secondary flex items-center justify-center gap-2 cursor-pointer text-black dark:text-white rounded-lg p-2 w-full sm:w-auto border-2 border-gray-200 dark:border-gray-600"
              >
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
                  プッシュ通知はアプリを閉じていても通知が届きますが、OSの省電力設定などの影響を受ける場合があります。
                </p>
                <strong className="mt-2 block text-gray-600 dark:text-gray-400">
                  推奨事項:
                </strong>
                <ul className="list-disc list-inside ml-2 text-gray-600 dark:text-gray-400">
                  <li>
                    PWAとしてインストールしてご利用いただくことを強く推奨します。
                  </li>
                  <li>
                    GitHub
                    Actionsの実行タイミングにより、通知には数分から数時間の遅延が生じる可能性があります。
                  </li>
                </ul>
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
                  最後に通知をタップしてから半年間ご利用がない場合、リマインダーやプッシュ通知購読情報などのサーバーデータは自動的に削除されます。
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

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">更新履歴</span>
              <a
                href="https://github.com/lost-nd-xxx/update-bell-app/blob/main/docs/CHANGELOG.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                内容を確認 <ExternalLink size={12} />
              </a>
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
