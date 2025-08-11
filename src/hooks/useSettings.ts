import { useState, useEffect } from 'react'
import { AppSettings } from '../types'

const defaultSettings: AppSettings = {
  notificationInterval: 30, // デフォルトを30分に変更
  theme: 'system',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  lastTimezoneCheck: new Date().toISOString(),
  notifications: {
    enabled: false,
    permission: 'default'
  },
  ui: {
    showWelcome: true,
    compactMode: false
  }
}

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('manga-reminder-settings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return { ...defaultSettings, ...parsed }
      } catch (error) {
        console.error('設定の読み込みに失敗:', error)
        return defaultSettings
      }
    }
    return defaultSettings
  })

  // 設定をlocalStorageに保存
  useEffect(() => {
    localStorage.setItem('manga-reminder-settings', JSON.stringify(settings))
  }, [settings])

  // 通知許可状態を監視
  useEffect(() => {
    if ('Notification' in window) {
      const updatePermission = () => {
        setSettings(prev => ({
          ...prev,
          notifications: {
            ...prev.notifications,
            permission: Notification.permission
          }
        }))
      }

      // 初期状態を設定
      updatePermission()

      // 許可状態の変更を監視（Safariなど一部ブラウザでサポート）
      if ('permissions' in navigator) {
        navigator.permissions.query({ name: 'notifications' as PermissionName })
          .then(permission => {
            permission.addEventListener('change', updatePermission)
            return () => permission.removeEventListener('change', updatePermission)
          })
          .catch(() => {
            // permissions APIが利用できない場合は無視
          })
      }
    } else {
      setSettings(prev => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          permission: 'unsupported'
        }
      }))
    }
  }, [])

  // タイムゾーンを定期的にチェック
  useEffect(() => {
    const checkTimezone = () => {
      const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (currentTimezone !== settings.timezone) {
        setSettings(prev => ({
          ...prev,
          timezone: currentTimezone,
          lastTimezoneCheck: new Date().toISOString()
        }))
      }
    }

    // 1時間ごとにチェック
    const interval = setInterval(checkTimezone, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [settings.timezone])

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => ({
      ...prev,
      ...updates
    }))
  }

  const requestNotificationPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      setSettings(prev => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          permission,
          enabled: permission === 'granted'
        }
      }))
      return permission === 'granted'
    } catch (error) {
      console.error('通知許可の取得に失敗:', error)
      return false
    }
  }

  const resetSettings = () => {
    setSettings(defaultSettings)
  }

  return {
    settings,
    updateSettings,
    requestNotificationPermission,
    resetSettings
  }
}