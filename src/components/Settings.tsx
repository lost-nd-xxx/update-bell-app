import React, { useState, useMemo } from "react";
import {
  ArrowLeft,
  Moon,
  Sun,
  Monitor,
  Download,
  Upload,
  Trash2,
  Info,
  CheckCircle,
  AlertCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Book,
  BarChart3,
} from "lucide-react";
import { AppSettings, Reminder, ExportData } from "../types";
import {
  downloadFile,
  readFile,
  getErrorMessage,
  isReminder,
} from "../utils/helpers";

interface SettingsProps {
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  reminders: Reminder[];
  onBack: () => void;
  onImportReminders?: (reminders: Reminder[]) => void;
  onImportTheme?: (theme: "light" | "dark" | "system") => void;
}

interface ExtendedNavigator extends Navigator {
  standalone?: boolean;
}

const thirdPartyLicenses = [
  {
    name: "React",
    license: "MIT",
    copyright: "Meta Platforms, Inc. and affiliates.",
    url: "https://github.com/facebook/react",
  },
  {
    name: "React DOM",
    license: "MIT",
    copyright: "Meta Platforms, Inc. and affiliates.",
    url: "https://github.com/facebook/react",
  },
  {
    name: "Vite",
    license: "MIT",
    copyright: "2019-present, Yuxi (Evan) You and Vite contributors",
    url: "https://github.com/vitejs/vite",
  },
  {
    name: "TypeScript",
    license: "Apache 2.0",
    copyright: "Microsoft Corporation",
    url: "https://github.com/Microsoft/TypeScript",
  },
  {
    name: "Tailwind CSS",
    license: "MIT",
    copyright: "Tailwind Labs, Inc.",
    url: "https://github.com/tailwindlabs/tailwindcss",
  },
  {
    name: "Lucide React",
    license: "ISC",
    copyright: "2020, Lucide Contributors",
    url: "https://github.com/lucide-icons/lucide",
  },
  {
    name: "vite-plugin-pwa",
    license: "MIT",
    copyright: "2020-present, Anthony Fu",
    url: "https://github.com/vite-pwa/vite-plugin-pwa",
  },
  {
    name: "ESLint",
    license: "MIT",
    copyright: "2013-present Nicholas C. Zakas and an ESLint team.",
    url: "https://github.com/eslint/eslint",
  },
  {
    name: "Prettier",
    license: "MIT",
    copyright: "2017-present, James Long and contributors",
    url: "https://github.com/prettier/prettier",
  },
  {
    name: "Rounded Mplus 1c",
    license: "SIL Open Font License 1.1",
    copyright: "2018-2022 The M PLUS Project Authors.",
    url: "https://fonts.google.com/specimen/M+PLUS+Rounded+1c",
  },
];

const Settings: React.FC<SettingsProps> = ({
  theme,
  setTheme,
  settings,
  updateSettings,
  reminders,
  onBack,
  onImportReminders,
  onImportTheme,
}) => {
  const [importStatus, setImportStatus] = useState<string>("");
  const [importType, setImportType] = useState<"success" | "error" | "">("");
  const [notificationTestStatus, setNotificationTestStatus] =
    useState<string>("");
  const [notificationTestType, setNotificationTestType] = useState<
    "success" | "error" | ""
  >("");
  const [isImporting, setIsImporting] = useState(false);
  const [showLicenses, setShowLicenses] = useState(false);

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

  const displayStatusMessage = (
    message: string,
    type: "success" | "error",
    target: "import" | "notification",
  ) => {
    if (target === "import") {
      setImportStatus(message);
      setImportType(type);
    } else {
      setNotificationTestStatus(message);
      setNotificationTestType(type);
    }
    setTimeout(() => {
      if (target === "import") {
        setImportStatus("");
        setImportType("");
      } else {
        setNotificationTestStatus("");
        setNotificationTestType("");
      }
    }, 5000);
  };

  const exportData = () => {
    const data: ExportData = {
      version: process.env.APP_VERSION || "1.0.0",
      exportDate: new Date().toISOString(),
      reminders,
      settings,
      theme,
      metadata: {
        userAgent: navigator.userAgent,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    const filename = `update-bell-${new Date().toISOString().split("T")[0]}.json`;
    downloadFile(JSON.stringify(data, null, 2), filename);
    displayStatusMessage("データをエクスポートしました", "success", "import");
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus("");
    setImportType("");

    try {
      const content = await readFile(file);
      const data = JSON.parse(content) as ExportData;

      if (!data.reminders || !Array.isArray(data.reminders)) {
        throw new Error("無効なファイル形式です");
      }

      const validReminders = data.reminders.filter(isReminder);
      const invalidCount = data.reminders.length - validReminders.length;

      if (validReminders.length > 0 && onImportReminders) {
        onImportReminders(validReminders);
      }
      if (data.theme && onImportTheme) {
        onImportTheme(data.theme);
      }
      if (data.settings) {
        updateSettings(data.settings);
      }

      let message = `${validReminders.length}個のリマインダーをインポートしました`;
      if (invalidCount > 0) {
        message += ` (${invalidCount}個の無効なデータは除外されました)`;
      }
      displayStatusMessage(message, "success", "import");
    } catch (error) {
      displayStatusMessage(
        `インポートに失敗: ${getErrorMessage(error)}`,
        "error",
        "import",
      );
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      alert("このブラウザは通知をサポートしていません");
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
    } catch (error) {
      console.error("通知許可の取得に失敗:", error);
    }
  };

  const sendTestNotification = () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "TEST_NOTIFICATION",
      });
      displayStatusMessage(
        "テスト通知を送信しました。5秒後に届きます。アプリを閉じてお待ちください。",
        "success",
        "notification",
      );
    } else {
      displayStatusMessage(
        "Service Workerが有効ではありません。ページを再読み込みしてください。",
        "error",
        "notification",
      );
    }
  };

  const clearAllData = () => {
    if (
      confirm(
        "すべてのリマインダーと設定が削除されます。\nこの操作は取り消せません。続行しますか？",
      )
    ) {
      localStorage.clear();
      location.reload();
    }
  };

  const getNotificationStatusText = () => {
    switch (settings.notifications.permission) {
      case "granted":
        return (
          <div className="flex items-center gap-2">
            <CheckCircle
              className="text-green-600 dark:text-green-400"
              size={16}
            />
            <span>許可済み</span>
          </div>
        );
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
                {getNotificationStatusText()}
              </div>
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

            {notificationTestStatus && (
              <div
                className={`mt-4 p-3 rounded-lg border ${notificationTestType === "success" ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"}`}
              >
                <div className="flex items-center gap-2">
                  {notificationTestType === "success" ? (
                    <CheckCircle
                      className="text-green-600 dark:text-green-400 flex-shrink-0"
                      size={16}
                    />
                  ) : (
                    <AlertCircle
                      className="text-red-600 dark:text-red-400 flex-shrink-0"
                      size={16}
                    />
                  )}

                  <div
                    className={`text-sm ${notificationTestType === "success" ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}
                  >
                    {notificationTestStatus}
                  </div>
                </div>
              </div>
            )}
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
                  onClick={clearAllData}
                  className="btn btn-danger flex items-center justify-center gap-2 text-black dark:text-white rounded-lg p-2 w-full sm:w-auto border-2 border-gray-200 dark:border-gray-600"
                >
                  <Trash2 size={16} />
                  削除
                </button>
              </div>
            </div>
            {importStatus && (
              <div
                className={`mt-4 p-3 rounded-lg border ${importType === "success" ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"}`}
              >
                <div className="flex items-center gap-2">
                  {importType === "success" ? (
                    <CheckCircle
                      className="text-green-600 dark:text-green-400"
                      size={16}
                    />
                  ) : (
                    <AlertCircle
                      className="text-red-600 dark:text-red-400"
                      size={16}
                    />
                  )}
                  <div
                    className={`text-sm ${importType === "success" ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}
                  >
                    {importStatus}
                  </div>
                </div>
              </div>
            )}
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
                  このアプリが通知を送るには、WebブラウザまたはPWAがバックグラウンドで動作している必要があります。
                  <br />
                  アプリを終了した場合や、端末の省電力モードが強く働いている場合は、通知を受信できないことがあります。
                  <br />
                  確実に通知を受信するためには、PWAとしてインストールし、アプリを終了せずバックグラウンドに待機させてご利用ください。
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded">
              <div className="text-sm text-black dark:text-white">
                <p className="flex flex-row gap-2 items-center">
                  <Info size={16} className="text-blue-500" />
                  <strong>将来の機能変更について</strong>
                </p>
                <p className="mt-1 text-gray-600 dark:text-gray-400">
                  より確実な通知のため、将来的に外部プッシュ通知サービスの追加導入を予定しています。
                  <br />
                  その際、現在のオフライン動作機能は廃止される可能性があります。
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
            <button
              onClick={() => setShowLicenses(!showLicenses)}
              className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300 rounded-lg p-2 border-2 border-gray-200 dark:border-gray-600"
            >
              <Book size={16} />
              {showLicenses ? "ライセンス一覧を非表示" : "ライセンス一覧を表示"}
            </button>

            {showLicenses && (
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 max-h-96 overflow-y-auto scrollbar-thin mt-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 pb-4 border-b border-gray-200 dark:border-gray-600">
                  このアプリは以下のオープンソースライブラリを使用しています。
                </p>

                <div className="space-y-3">
                  {thirdPartyLicenses.map((lib) => (
                    <div
                      key={lib.name}
                      className="border-b border-gray-200 dark:border-gray-600 pb-3 last:border-b-0"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {lib.name}
                        </h4>
                        <a
                          href={lib.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 text-sm"
                        >
                          Repository
                          <ExternalLink size={12} />
                        </a>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <div>License: {lib.license}</div>
                        <div>Copyright: {lib.copyright}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    完全なライセンステキストは、各ライブラリのリポジトリまたは
                    <a
                      href="https://github.com/lost-nd-xxx/update-bell-app/blob/main/THIRD-PARTY-LICENSES.md"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline ml-1"
                    >
                      プロジェクトのライセンスファイル
                      <ExternalLink size={10} className="inline ml-1" />
                    </a>
                    をご確認ください。
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
