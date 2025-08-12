import React, { useState, useEffect } from 'react'
import { X, Plus, AlertTriangle, Clock } from 'lucide-react'
import { Reminder, Schedule, DateFilterType, ScheduleType } from '../types'
import { 
  isValidUrl, 
  normalizeUrl, 
  generateScheduleDescription,
  calculateNextNotificationTime,
  getDayName,
  getWeekName
} from '../utils/helpers'

interface CreateReminderProps {
  editingReminder?: Reminder | null
  onSave: (reminder: Omit<Reminder, 'id' | 'createdAt' | 'timezone'>) => void
  onCancel: () => void
}

const CreateReminder: React.FC<CreateReminderProps> = ({
  editingReminder,
  onSave,
  onCancel
}) => {
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    schedule: {
      type: 'weekly' as ScheduleType,
      dayOfWeek: 1, // 月曜日
      hour: 10,
      minute: 0,
      interval: 1,
      weekOfMonth: 1,
      dateFilter: 'all' as DateFilterType,
      selectedDays: [1] // 月曜日（複数曜日選択用）
    } as Schedule & { selectedDays: number[] },
    tags: [] as string[],
    isPaused: false
  })

  const [tagInput, setTagInput] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  // 編集モードの場合、データを設定
  useEffect(() => {
    if (editingReminder) {
      setFormData({
        title: editingReminder.title,
        url: editingReminder.url,
        schedule: {
          ...editingReminder.schedule,
          selectedDays: editingReminder.schedule.selectedDays || 
                       (editingReminder.schedule.dayOfWeek !== undefined 
                        ? [editingReminder.schedule.dayOfWeek] 
                        : [1])
        },
        tags: [...editingReminder.tags],
        isPaused: editingReminder.isPaused
      })
    }
  }, [editingReminder])

  // 周期設定変更時に警告をチェック
  useEffect(() => {
    const newWarnings: string[] = []
    
    if (formData.schedule.type === 'monthly' && 
        formData.schedule.weekOfMonth && 
        formData.schedule.weekOfMonth >= 5 &&
        formData.schedule.dayOfWeek !== undefined) {
      const dayName = getDayName(formData.schedule.dayOfWeek)
      newWarnings.push(
        `第5${dayName}曜日は存在しない月があります。該当しない月はスキップされます。`
      )
    }
    
    setWarnings(newWarnings)
  }, [formData.schedule.type, formData.schedule.weekOfMonth, formData.schedule.dayOfWeek])

  // バリデーション
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.title.trim()) {
      newErrors.title = 'タイトルは必須です'
    }
    
    if (!formData.url.trim()) {
      newErrors.url = 'URLは必須です'
    } else if (!isValidUrl(normalizeUrl(formData.url))) {
      newErrors.url = '有効なURLを入力してください'
    }
    
    if (formData.schedule.hour < 0 || formData.schedule.hour > 23) {
      newErrors.hour = '時間は0-23の範囲で入力してください'
    }
    
    if (formData.schedule.minute < 0 || formData.schedule.minute > 59) {
      newErrors.minute = '分は0-59の範囲で入力してください'
    }
    
    if (formData.schedule.interval < 1) {
      newErrors.interval = '間隔は1以上で入力してください'
    }

    if (formData.schedule.type === 'specific_days' && 
        (!formData.schedule.selectedDays || formData.schedule.selectedDays.length === 0)) {
      newErrors.selectedDays = '曜日を1つ以上選択してください'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

const handleSubmit = () => {
  if (!validateForm()) return
  
  // selectedDaysを除外したscheduleを作成
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { selectedDays, ...cleanSchedule } = formData.schedule
  
  const reminderData = {
    title: formData.title,
    url: normalizeUrl(formData.url),
    tags: formData.tags,
    isPaused: formData.isPaused, // ← 明示的に設定
    schedule: {
      ...cleanSchedule,
      // specific_daysの場合はselectedDaysをscheduleに含める
      ...(formData.schedule.type === 'specific_days' && {
        selectedDays: formData.schedule.selectedDays
      })
    },
    lastNotified: editingReminder?.lastNotified || null,
    pausedAt: formData.isPaused ? (editingReminder?.pausedAt || new Date().toISOString()) : null
  }

  onSave(reminderData)
}

  const updateSchedule = (updates: Partial<Schedule>) => {
    setFormData(prev => ({
      ...prev,
      schedule: { ...prev.schedule, ...updates }
    }))
  }

  const addTag = () => {
    const tag = tagInput.trim()
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }))
      setTagInput('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }))
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (tagInput.trim()) {
        addTag()
      } else {
        handleSubmit()
      }
    }
  }

  const handleDayToggle = (day: number) => {
    setFormData(prev => {
      const newSelectedDays = prev.schedule.selectedDays.includes(day)
        ? prev.schedule.selectedDays.filter(d => d !== day)
        : [...prev.schedule.selectedDays, day].sort()
      
      return {
        ...prev,
        schedule: {
          ...prev.schedule,
          selectedDays: newSelectedDays,
          // 最初に選択された曜日をdayOfWeekに設定
          dayOfWeek: newSelectedDays[0] || 1
        }
      }
    })
  }

  // プレビュー情報
  const scheduleDescription = generateScheduleDescription(formData.schedule)
  const nextNotification = calculateNextNotificationTime(formData.schedule)

  return (
    <div className="card p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {editingReminder ? 'リマインダーを編集' : '新しいリマインダー'}
        </h2>
        <button
          onClick={onCancel}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-6">
        {/* 基本情報 */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              タイトル *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className={`input ${errors.title ? 'border-red-500' : ''}`}
              placeholder="例: 鉄腕アトム"
              onKeyPress={handleKeyPress}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.title}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              URL *
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              className={`input ${errors.url ? 'border-red-500' : ''}`}
              placeholder="https://manga-site.example.com/atom"
              onKeyPress={handleKeyPress}
            />
            {errors.url && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.url}</p>
            )}
          </div>
        </div>

        {/* 周期設定 */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">通知設定</h3>
          
          {/* 周期タイプ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              通知周期
            </label>
            <select
              value={formData.schedule.type}
              onChange={(e) => updateSchedule({ type: e.target.value as Schedule['type'] })}
              className="input"
            >
              <option value="daily">毎日</option>
              <option value="interval">数日ごと</option>
              <option value="weekly">毎週○曜日</option>
              <option value="specific_days">毎週☆曜日（複数）</option>
              <option value="monthly">毎月第△週◇曜日</option>
            </select>
          </div>

          {/* 詳細設定 - 毎日（日付フィルター削除） */}
          {formData.schedule.type === 'daily' && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              毎日指定した時刻に通知されます。
            </div>
          )}

          {/* 詳細設定 - 数日ごと */}
          {formData.schedule.type === 'interval' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                間隔（日数）
              </label>
              <input
                type="number"
                min="2"
                max="365"
                value={formData.schedule.interval}
                onChange={(e) => updateSchedule({ interval: parseInt(e.target.value) || 2 })}
                className={`input ${errors.interval ? 'border-red-500' : ''}`}
              />
              {errors.interval && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.interval}</p>
              )}
            </div>
          )}

          {/* 詳細設定 - 毎週 */}
          {formData.schedule.type === 'weekly' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  曜日
                </label>
                <select
                  value={formData.schedule.dayOfWeek || 1}
                  onChange={(e) => updateSchedule({ dayOfWeek: parseInt(e.target.value) })}
                  className="input"
                >
                  {[0, 1, 2, 3, 4, 5, 6].map(day => (
                    <option key={day} value={day}>
                      {getDayName(day)}曜日
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  間隔（週）
                </label>
                <input
                  type="number"
                  min="1"
                  max="52"
                  value={formData.schedule.interval}
                  onChange={(e) => updateSchedule({ interval: parseInt(e.target.value) || 1 })}
                  className={`input ${errors.interval ? 'border-red-500' : ''}`}
                />
                {errors.interval && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.interval}</p>
                )}
              </div>
            </div>
          )}

          {/* 詳細設定 - 特定の曜日（チェックボックス式） */}
          {formData.schedule.type === 'specific_days' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                曜日を選択 *
              </label>
              <div className="grid grid-cols-7 gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map(day => (
                  <label key={day} className="flex flex-col items-center">
                    <input
                      type="checkbox"
                      checked={formData.schedule.selectedDays.includes(day)}
                      onChange={() => handleDayToggle(day)}
                      className="mb-1 rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-xs text-center text-gray-700 dark:text-gray-300">
                      {getDayName(day)}
                    </span>
                  </label>
                ))}
              </div>
              {errors.selectedDays && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.selectedDays}</p>
              )}
            </div>
          )}

          {/* 詳細設定 - 毎月 */}
          {formData.schedule.type === 'monthly' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  第何週
                </label>
                <select
                  value={formData.schedule.weekOfMonth || 1}
                  onChange={(e) => updateSchedule({ weekOfMonth: parseInt(e.target.value) })}
                  className="input"
                >
                  {[1, 2, 3, 4].map(week => (
                    <option key={week} value={week}>
                      {getWeekName(week)}週
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  曜日
                </label>
                <select
                  value={formData.schedule.dayOfWeek || 1}
                  onChange={(e) => updateSchedule({ dayOfWeek: parseInt(e.target.value) })}
                  className="input"
                >
                  {[0, 1, 2, 3, 4, 5, 6].map(day => (
                    <option key={day} value={day}>
                      {getDayName(day)}曜日
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 時刻設定 - 改善されたレイアウト */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              通知時刻
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={formData.schedule.hour}
                  onChange={(e) => updateSchedule({ hour: parseInt(e.target.value) || 0 })}
                  className={`input w-20 text-center ${errors.hour ? 'border-red-500' : ''}`}
                />
                <span className="text-gray-600 dark:text-gray-400 font-medium">時</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={formData.schedule.minute}
                  onChange={(e) => updateSchedule({ minute: parseInt(e.target.value) || 0 })}
                  className={`input w-20 text-center ${errors.minute ? 'border-red-500' : ''}`}
                />
                <span className="text-gray-600 dark:text-gray-400 font-medium">分</span>
              </div>
            </div>
            {(errors.hour || errors.minute) && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.hour || errors.minute}
              </p>
            )}
          </div>

          {/* 設定内容の確認 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="text-blue-600 dark:text-blue-400" size={16} />
              <span className="font-medium text-blue-800 dark:text-blue-300">設定内容の確認</span>
            </div>
            <p className="text-blue-700 dark:text-blue-300 text-sm">
              {scheduleDescription}
            </p>
            <p className="text-blue-600 dark:text-blue-400 text-xs mt-1">
              次回通知予定: {nextNotification.toLocaleString('ja-JP')}
            </p>
          </div>

          {/* 警告メッセージ */}
          {warnings.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={16} />
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  {warnings.map((warning, index) => (
                    <p key={index}>{warning}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* タグ設定 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            タグ
          </label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
              className="input flex-1"
              placeholder="タグを追加"
            />
            <button
              type="button"
              onClick={addTag}
              className="btn btn-secondary text-white"
              disabled={!tagInput.trim()}
            >
              <Plus size={16} />
            </button>
          </div>
          
          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm"
                >
                  #{tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 ml-1"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 一時停止設定 */}
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isPaused}
              onChange={(e) => setFormData(prev => ({ ...prev, isPaused: e.target.checked }))}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              一時停止状態で作成
            </span>
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            一時停止中は通知が送信されません
          </p>
        </div>

        {/* アクションボタン */}
        <div className="flex gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSubmit}
            className="btn btn-primary flex-1 text-white"
          >
            {editingReminder ? '更新' : '作成'}
          </button>
          <button
            onClick={onCancel}
            className="btn btn-secondary flex-1 text-white"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreateReminder