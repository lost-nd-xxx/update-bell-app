import React, { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Reminder, AppSettings, AppState } from './types'
import { useReminders } from './hooks/useReminders'
import { useSettings } from './hooks/useSettings'
import { useTheme } from './hooks/useTheme'
import { useTimezone } from './hooks/useTimezone'
import Dashboard from './components/Dashboard'
import CreateReminder from './components/CreateReminder'
import Settings from './components/Settings'
import TimezoneChangeDialog from './components/TimezoneChangeDialog'
import Header from './components/Header'

const App: React.FC = () => {
  const { settings, updateSettings } = useSettings()
  const [theme, setTheme] = useTheme()
  const { reminders, addReminder, updateReminder, deleteReminder } = useReminders()
  const { timezoneChanged, handleTimezoneChange, dismissTimezoneChange } = useTimezone(reminders, updateReminder)
  
  const [appState, setAppState] = useState<AppState>({
    currentView: 'dashboard',
    editingReminder: null,
    filter: {
      searchTerm: '',
      selectedTags: [],
      showPaused: true
    },
    sort: {
      field: 'lastNotified',
      order: 'desc'
    },
    isLoading: false,
    error: null
  })

  // Service Worker初期化とデータ同期
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const message = event.data as any
        
        switch (message.type) {
          case 'NOTIFICATION_SENT':
            updateReminder(message.reminderId, { 
              lastNotified: message.timestamp 
            })
            break
          case 'NOTIFICATION_CLICKED':
            // 通知クリック時の処理（必要に応じて）
            console.log('Notification clicked:', message.reminderId, message.action)
            break
          case 'REQUEST_REMINDERS_DATA':
            // Service WorkerからのデータRequest
            if ((window as any).mangaReminder?.updateRemindersCache) {
              (window as any).mangaReminder.updateRemindersCache(reminders)
            }
            break
          case 'REQUEST_SETTINGS_DATA':
            // Service WorkerからのSettingsRequest
            if ((window as any).mangaReminder?.updateSettingsCache) {
              (window as any).mangaReminder.updateSettingsCache(settings)
            }
            break
        }
      })
    }
  }, [reminders, settings, updateReminder])

  // リマインダーデータが変更された時にService Workerに同期
  useEffect(() => {
    if (reminders.length > 0 && (window as any).mangaReminder?.updateRemindersCache) {
      (window as any).mangaReminder.updateRemindersCache(reminders)
    }
  }, [reminders])

  // 設定が変更された時にService Workerに同期
  useEffect(() => {
    if ((window as any).mangaReminder?.updateSettingsCache) {
      (window as any).mangaReminder.updateSettingsCache(settings)
    }
    
    // 通知間隔が変更された場合は定期チェックを再開
    if (settings.notificationInterval && (window as any).mangaReminder?.startPeriodicCheck) {
      (window as any).mangaReminder.startPeriodicCheck(settings.notificationInterval)
    }
  }, [settings])

  const handleViewChange = (view: AppState['currentView'], editingReminder?: Reminder) => {
    setAppState(prev => ({
      ...prev,
      currentView: view,
      editingReminder: editingReminder || null
    }))
  }

  const handleReminderSave = (reminderData: Omit<Reminder, 'id' | 'createdAt' | 'timezone'>) => {
    if (appState.editingReminder) {
      updateReminder(appState.editingReminder.id, reminderData)
    } else {
      addReminder(reminderData)
    }
    handleViewChange('dashboard')
  }

  const handleFilterChange = (filter: Partial<AppState['filter']>) => {
    setAppState(prev => ({
      ...prev,
      filter: { ...prev.filter, ...filter }
    }))
  }

  const handleSortChange = (sort: Partial<AppState['sort']>) => {
    setAppState(prev => ({
      ...prev,
      sort: { ...prev.sort, ...sort }
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* ヘッダー */}
      <Header 
        onSettingsClick={() => handleViewChange('settings')}
        notificationsEnabled={settings.notifications.enabled}
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
        {appState.currentView === 'dashboard' && (
          <Dashboard
            reminders={reminders}
            filter={appState.filter}
            sort={appState.sort}
            onFilterChange={handleFilterChange}
            onSortChange={handleSortChange}
            onEdit={(reminder) => handleViewChange('create', reminder)}
            onDelete={deleteReminder}
            onTogglePause={(id, isPaused) => updateReminder(id, { 
              isPaused,
              pausedAt: isPaused ? new Date().toISOString() : null
            })}
            onCreateNew={() => handleViewChange('create')}
          />
        )}

        {appState.currentView === 'create' && (
          <CreateReminder
            editingReminder={appState.editingReminder}
            onSave={handleReminderSave}
            onCancel={() => handleViewChange('dashboard')}
          />
        )}

        {appState.currentView === 'settings' && (
          <Settings
            theme={theme}
            setTheme={setTheme}
            settings={settings}
            updateSettings={updateSettings}
            reminders={reminders}
            onBack={() => handleViewChange('dashboard')}
          />
        )}
      </main>

      {/* フローティングアクションボタン */}
      {appState.currentView === 'dashboard' && (
        <button
          onClick={() => handleViewChange('create')}
          className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-all hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="新しいリマインダーを作成"
        >
          <Plus size={24} />
        </button>
      )}
    </div>
  )
}

export default App