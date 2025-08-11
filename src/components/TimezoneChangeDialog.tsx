import React from 'react'
import { MapPin, Clock, AlertTriangle } from 'lucide-react'
import { Reminder } from '../types'

interface TimezoneChangeDialogProps {
  previousTimezone: string
  currentTimezone: string
  affectedReminders: Reminder[]
  onConfirm: (adjustTime: boolean) => void
  onDismiss: () => void
}

const TimezoneChangeDialog: React.FC<TimezoneChangeDialogProps> = ({
  previousTimezone,
  currentTimezone,
  affectedReminders,
  onConfirm,
  onDismiss
}) => {
  const formatTimezone = (timezone: string): string => {
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

  const getTimezoneExample = (timezone: string): string => {
    try {
      const now = new Date()
      return now.toLocaleTimeString('ja-JP', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return '不明'
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* ヘッダー */}
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <MapPin className="text-orange-600 dark:text-orange-400" size={20} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              タイムゾーンの変更を検出
            </h2>
          </div>

          {/* 変更内容 */}
          <div className="space-y-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={16} className="text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-800 dark:text-blue-300">タイムゾーン変更</span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">変更前:</span>
                  <div className="text-right">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {formatTimezone(previousTimezone)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      現在時刻: {getTimezoneExample(previousTimezone)}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">変更後:</span>
                  <div className="text-right">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {formatTimezone(currentTimezone)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      現在時刻: {getTimezoneExample(currentTimezone)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 影響を受けるリマインダー */}
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                影響を受けるリマインダー ({affectedReminders.length}件)
              </h3>
              <div className="max-h-32 overflow-y-auto space-y-2">
                {affectedReminders.map(reminder => (
                  <div key={reminder.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="font-medium text-gray-900 dark:text-white text-sm">
                      {reminder.title}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      設定時刻: {reminder.schedule.hour.toString().padStart(2, '0')}:
                      {reminder.schedule.minute.toString().padStart(2, '0')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 警告 */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={16} />
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  <p className="font-medium mb-1">どのように対応しますか？</p>
                  <ul className="space-y-1 text-xs">
                    <li>• <strong>時刻を調整</strong>: 同じ絶対時刻を維持（推奨）</li>
                    <li>• <strong>現地時刻を維持</strong>: 設定した時刻をそのまま維持</li>
                    <li>• <strong>後で決める</strong>: 手動で調整</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* アクションボタン */}
          <div className="space-y-3">
            <button
              onClick={() => onConfirm(true)}
              className="w-full btn btn-primary"
            >
              時刻を調整する（推奨）
            </button>
            
            <button
              onClick={() => onConfirm(false)}
              className="w-full btn btn-secondary"
            >
              現地時刻を維持する
            </button>
            
            <button
              onClick={onDismiss}
              className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              後で決める
            </button>
          </div>

          {/* 補足説明 */}
          <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            この設定は後から個別に変更することも可能です。
          </div>
        </div>
      </div>
    </div>
  )
}

export default TimezoneChangeDialog