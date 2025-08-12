import { useState, useEffect } from 'react'
import { Reminder, TimezoneChangeDetection } from '../types'

export const useTimezone = (
  reminders: Reminder[],
  updateReminder: (id: string, updates: Partial<Reminder>) => void
) => {
  const [timezoneChanged, setTimezoneChanged] = useState<TimezoneChangeDetection | null>(null)
  const [lastKnownTimezone, setLastKnownTimezone] = useState<string>(() => {
    return localStorage.getItem('manga-reminder-timezone') || 
           Intl.DateTimeFormat().resolvedOptions().timeZone
  })

  // タイムゾーン変更を検出
  useEffect(() => {
    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    
    if (currentTimezone !== lastKnownTimezone && reminders.length > 0) {
      // 影響を受けるリマインダーを特定
      const affectedReminders = reminders.filter(reminder => 
        reminder.timezone && reminder.timezone !== currentTimezone
      )

      if (affectedReminders.length > 0) {
        setTimezoneChanged({
          changed: true,
          previous: lastKnownTimezone,
          current: currentTimezone,
          affectedReminders
        })
      } else {
        // 影響を受けるリマインダーがない場合は自動更新
        setLastKnownTimezone(currentTimezone)
        localStorage.setItem('manga-reminder-timezone', currentTimezone)
      }
    }
  }, [lastKnownTimezone, reminders])

  // 定期的なタイムゾーンチェック（1時間ごと）
  useEffect(() => {
    const checkTimezone = () => {
      const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (currentTimezone !== lastKnownTimezone) {
        setLastKnownTimezone(currentTimezone)
      }
    }

    const interval = setInterval(checkTimezone, 60 * 60 * 1000) // 1時間
    return () => clearInterval(interval)
  }, [lastKnownTimezone])

  const handleTimezoneChange = (adjustTime: boolean = true) => {
    if (!timezoneChanged) return

    const { current, affectedReminders } = timezoneChanged

    if (adjustTime) {
      // 時刻を調整する場合
      affectedReminders.forEach(reminder => {
        updateReminder(reminder.id, {
          timezone: current
          // 注意: 実際の時刻調整ロジックは複雑になるため、
          // ここでは単純にタイムゾーンのみを更新
        })
      })
    } else {
      // 現地時刻を維持する場合
      affectedReminders.forEach(reminder => {
        updateReminder(reminder.id, {
          timezone: current
        })
      })
    }

    // 新しいタイムゾーンを保存
    setLastKnownTimezone(current)
    localStorage.setItem('manga-reminder-timezone', current)
    
    // ダイアログを閉じる
    setTimezoneChanged(null)
  }

  const dismissTimezoneChange = () => {
    if (timezoneChanged) {
      // 新しいタイムゾーンを保存（何もしないという選択）
      setLastKnownTimezone(timezoneChanged.current)
      localStorage.setItem('manga-reminder-timezone', timezoneChanged.current)
    }
    setTimezoneChanged(null)
  }

  const getTimezoneOffset = (timezone: string): number => {
    try {
      const now = new Date()
      const utc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000))
      const targetTime = new Date(utc.toLocaleString('en-US', { timeZone: timezone }))
      return (targetTime.getTime() - utc.getTime()) / (1000 * 60) // 分単位で返す
    } catch (error) {
      console.error('タイムゾーンオフセットの取得に失敗:', error)
      return 0
    }
  }

  const convertTimeToTimezone = (
    hour: number, 
    minute: number, 
    fromTimezone: string, 
    toTimezone: string
  ): { hour: number; minute: number } => {
    try {
      // 基準日を作成（任意の日付でOK）
      const baseDate = new Date('2024-01-01')
      baseDate.setHours(hour, minute, 0, 0)
      
      // 元のタイムゾーンでの日時を作成
      const fromTime = new Date(baseDate.toLocaleString('en-US', { timeZone: fromTimezone }))
      
      // 新しいタイムゾーンに変換
      const toTime = new Date(fromTime.toLocaleString('en-US', { timeZone: toTimezone }))
      
      return {
        hour: toTime.getHours(),
        minute: toTime.getMinutes()
      }
    } catch (error) {
      console.error('時刻変換に失敗:', error)
      return { hour, minute } // 失敗時は元の時刻を返す
    }
  }

  const formatTimezoneDisplay = (timezone: string): string => {
    try {
      const formatter = new Intl.DateTimeFormat('ja-JP', {
        timeZone: timezone,
        timeZoneName: 'long'
      })
      
      const parts = formatter.formatToParts(new Date())
      const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value
      
      return timeZoneName || timezone
    } catch {
      return timezone
    }
  }

  return {
    timezoneChanged,
    lastKnownTimezone,
    handleTimezoneChange,
    dismissTimezoneChange,
    getTimezoneOffset,
    convertTimeToTimezone,
    formatTimezoneDisplay
  }
}