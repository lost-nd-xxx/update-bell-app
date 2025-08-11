import React from 'react'
import { Settings, Bell, BellOff } from 'lucide-react'

interface HeaderProps {
  onSettingsClick: () => void
  notificationsEnabled?: boolean
}

const Header: React.FC<HeaderProps> = ({ 
  onSettingsClick, 
  notificationsEnabled = false 
}) => {
  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              ウェブ漫画リマインダー
            </h1>
            {/* 通知ステータス表示 */}
            <div className="flex items-center gap-1">
              {notificationsEnabled ? (
                <Bell className="w-4 h-4 text-green-600 dark:text-green-400" />
              ) : (
                <BellOff className="w-4 h-4 text-gray-400" />
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* PWAインストール状態表示 */}
            {window.matchMedia('(display-mode: standalone)').matches && (
              <div className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                PWA版
              </div>
            )}
            
            <button
              onClick={onSettingsClick}
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="設定を開く"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header