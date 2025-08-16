import React, { useState } from "react";
import {
  ArrowLeft,
  Bell,
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
} from "lucide-react";
import { AppSettings, Reminder, ExportData } from "../types";
import { downloadFile, readFile, getErrorMessage } from "../utils/helpers";

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
    copyright: "Meta Platforms, Inc. and affiliates",
    url: "https://github.com/facebook/react",
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
    copyright: "Lucide Contributors",
    url: "https://github.com/lucide-icons/lucide",
  },
  {
    name: "Vite",
    license: "MIT",
    copyright: "Evan You & Vite Contributors",
    url: "https://github.com/vitejs/vite",
  },
  {
    name: "TypeScript",
    license: "Apache 2.0",
    copyright: "Microsoft Corporation",
    url: "https://github.com/Microsoft/TypeScript",
  },
  {
    name: "vite-plugin-pwa",
    license: "MIT",
    copyright: "Anthony Fu",
    url: "https://github.com/vite-pwa/vite-plugin-pwa",
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
  const [isImporting, setIsImporting] = useState(false);
  const [showLicenses, setShowLicenses] = useState(false);

  const exportData = () => {
    const data: ExportData = {
      version: "1.0.0",
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

    setImportStatus("データをエクスポートしました");
    setImportType("success");
    setTimeout(() => {
      setImportStatus("");
      setImportType("");
    }, 3000);
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

      if (data.reminders && onImportReminders) {
        onImportReminders(data.reminders);
      }

      if (data.theme && onImportTheme) {
        onImportTheme(data.theme);
      }

      if (data.settings) {
        updateSettings(data.settings);
      }

      setImportStatus(
        `${data.reminders.length}個のリマインダーをインポートしました`,
      );
      setImportType("success");
    } catch (error) {
      setImportStatus(`インポートに失敗: ${getErrorMessage(error)}`);
      setImportType("error");
    } finally {
      setIsImporting(false);
      event.target.value = "";

      setTimeout(() => {
        setImportStatus("");
        setImportType("");
      }, 5000);
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

  const clearAllData = () => {
    const confirmed = confirm(
      "すべてのリマインダーと設定が削除されます。\n" +
        "この操作は取り消せません。続行しますか？",
    );

    if (confirmed) {
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
          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          aria-label="ダッシュボードに戻る"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          設定
        </h1>
      </div>

      <div className="space-y-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Bell size={20} />
            通知設定
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                チェック間隔
              </label>
              <select
                value={settings.notificationInterval}
                onChange={(e) =>
                  updateSettings({
                    notificationInterval: parseInt(e.target.value),
                  })
                }
                className="input"
              >
                <option value={15}>高精度モード (15分間隔)</option>
                <option value={30}>標準モード (30分間隔) - 推奨</option>
                <option value={60}>省電力モード (1時間間隔)</option>
                <option value={120}>超省電力モード (2時間間隔)</option>
              </select>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                短い間隔ほど正確ですが、バッテリー消費が増加します。通常は30分間隔で十分です。
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  通知許可状態
                </span>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {getNotificationStatusText()}
                </div>
              </div>

              {settings.notifications.permission !== "granted" && (
                <button
                  onClick={requestNotificationPermission}
                  className="btn btn-primary text-sm text-white"
                  disabled={settings.notifications.permission === "denied"}
                >
                  通知を許可
                </button>
              )}

              {!browserInfo.isPWA && (
                <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded">
                  <div className="flex items-start gap-2">
                    <Info
                      size={16}
                      className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5"
                    />
                    <div className="text-sm text-purple-800 dark:text-purple-300">
                      <strong>PWAとしてインストール</strong>
                      することで、より安定した通知が可能になります。
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            テーマ設定
          </h3>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setTheme("light")}
              className={`p-3 rounded-lg border-2 transition-colors ${
                theme === "light"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <Sun className="mx-auto mb-2 text-yellow-500" size={24} />
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                ライト
              </div>
            </button>

            <button
              onClick={() => setTheme("dark")}
              className={`p-3 rounded-lg border-2 transition-colors ${
                theme === "dark"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <Moon className="mx-auto mb-2 text-blue-500" size={24} />
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                ダーク
              </div>
            </button>

            <button
              onClick={() => setTheme("system")}
              className={`p-3 rounded-lg border-2 transition-colors ${
                theme === "system"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <Monitor className="mx-auto mb-2 text-gray-500" size={24} />
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                システム
              </div>
            </button>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            データ管理
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  データエクスポート
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  すべてのリマインダーと設定をJSONファイルでダウンロード
                </div>
              </div>
              <button
                onClick={exportData}
                className="btn btn-secondary flex items-center gap-2 text-white"
              >
                <Download size={16} />
                エクスポート
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  データインポート
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  JSONファイルからリマインダーと設定を復元
                </div>
              </div>
              <label className="btn btn-secondary flex items-center gap-2 cursor-pointer text-white">
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

            {importStatus && (
              <div
                className={`mt-2 p-3 rounded-lg border ${
                  importType === "success"
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                }`}
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
                    className={`text-sm ${
                      importType === "success"
                        ? "text-green-700 dark:text-green-300"
                        : "text-red-700 dark:text-red-300"
                    }`}
                  >
                    {importStatus}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-red-600 dark:text-red-400">
                    すべてのデータを削除
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    すべてのリマインダーと設定を削除します（取り消し不可）
                  </div>
                </div>
                <button
                  onClick={clearAllData}
                  className="btn btn-danger flex items-center gap-2 text-white"
                >
                  <Trash2 size={16} />
                  削除
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Info size={20} />
            注意事項
          </h3>

          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="font-medium text-yellow-800 dark:text-yellow-300 mb-1">
                データ保存について
              </p>
              <p className="text-yellow-700 dark:text-yellow-200">
                このアプリはブラウザのローカルストレージを使用してデータを保存します。
                ブラウザのキャッシュを削除するとデータが失われる可能性があります。
                重要なデータは定期的にエクスポートしてバックアップを取ることをお勧めします。
              </p>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                将来の機能変更について
              </p>
              <p className="text-blue-700 dark:text-blue-200">
                より確実な通知のため、将来的に外部プッシュ通知サービスの導入を予定しています。
                その際、現在のオフライン動作機能は廃止される可能性があります。
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            アプリ情報
          </h3>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">
                バージョン
              </span>
              <span className="text-gray-900 dark:text-white">1.0.0</span>
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
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <Book size={16} />
              {showLicenses ? "ライセンス一覧を非表示" : "ライセンス一覧を表示"}
            </button>

            {showLicenses && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-96 overflow-y-auto scrollbar-thin">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
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

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
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
