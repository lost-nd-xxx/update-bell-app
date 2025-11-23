import React, { useState } from "react";
import { Settings, Bell, BellOff, Info, X } from "lucide-react";

interface HeaderProps {
  onSettingsClick: () => void;
  onTitleClick: () => void;
  notificationsEnabled?: boolean;
  isSettingsView?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  onSettingsClick,
  onTitleClick,
  notificationsEnabled = false,
  isSettingsView = false,
}) => {
  const [showNotificationTooltip, setShowNotificationTooltip] = useState(false);

  const getNotificationStatus = () => {
    if (!("Notification" in window)) {
      return {
        icon: BellOff,
        color: "text-gray-400",
        message: "このブラウザは通知機能をサポートしていません",
      };
    }

    if (Notification.permission === "denied") {
      return {
        icon: BellOff,
        color: "text-red-500 dark:text-red-400",
        message: "通知が拒否されています。ブラウザ設定から許可してください",
      };
    }

    if (Notification.permission === "default") {
      return {
        icon: BellOff,
        color: "text-yellow-500 dark:text-yellow-400",
        message: "通知の許可が必要です。設定から有効にしてください",
      };
    }

    if (notificationsEnabled) {
      return {
        icon: Bell,
        color: "text-green-600 dark:text-green-400",
        message: "通知が有効です",
      };
    }

    return {
      icon: BellOff,
      color: "text-gray-400",
      message: "通知が無効です",
    };
  };

  const notificationStatus = getNotificationStatus();
  const NotificationIcon = notificationStatus.icon;

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onTitleClick}
              className="text-xl font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              おしらせベル
            </button>
            {/* 通知ステータス表示（クリック可能） */}
            <div className="relative">
              <button
                onClick={() =>
                  setShowNotificationTooltip(!showNotificationTooltip)
                }
                className={`flex items-center gap-1 p-2 rounded-lg border border-gray-500/10 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${notificationStatus.color}`}
                title="通知状態を確認"
              >
                <NotificationIcon size={20} />
              </button>

              {/* ツールチップ - レスポンシブ対応 */}
              {showNotificationTooltip && (
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50 sm:left-0 sm:transform-none">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                        通知状態
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 break-words">
                        {notificationStatus.message}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowNotificationTooltip(false)}
                    className="absolute top-2 right-2 text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-full border border-gray-500/20"
                  >
                    <X size={16} />
                  </button>

                  {/* スマホ用の矢印 */}
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-b-[8px] border-l-transparent border-r-transparent border-b-white dark:border-b-gray-800 sm:hidden"></div>

                  {/* デスクトップ用の矢印 */}
                  <div className="absolute -top-2 left-4 w-0 h-0 border-l-[8px] border-r-[8px] border-b-[8px] border-l-transparent border-r-transparent border-b-white dark:border-b-gray-800 hidden sm:block"></div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* PWAインストール状態表示 */}
            {window.matchMedia("(display-mode: standalone)").matches && (
              <div className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                PWA版
              </div>
            )}

            {/* 設定アイコン */}
            <button
              onClick={onSettingsClick}
              className={`p-2 rounded-lg border border-gray-500/10 transition-colors ${
                isSettingsView
                  ? "text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/20"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
              aria-label={
                isSettingsView ? "ダッシュボードに戻る" : "設定を開く"
              }
              title={isSettingsView ? "ダッシュボードに戻る" : "設定"}
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
