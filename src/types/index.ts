// リマインダーの周期タイプ
export type ScheduleType = 'daily' | 'weekly' | 'monthly'

// 日付フィルタータイプ
export type DateFilterType = 'all' | 'weekdays' | 'weekends'

// リマインダーの周期設定
export interface Schedule {
  type: ScheduleType
  interval: number // 間隔（n日ごと、n週ごと等）
  dayOfWeek?: number // 曜日 (0=日曜, 1=月曜, ...)
  weekOfMonth?: number // 月の第n週 (1-5)
  hour: number // 時間 (0-23)
  minute: number // 分 (0-59)
  dateFilter?: DateFilterType // 日付フィルター（毎日の場合のみ）
}

// リマインダーデータ
export interface Reminder {
  id: string
  title: string
  url: string
  schedule: Schedule
  tags: string[]
  createdAt: string // ISO 8601 形式
  lastNotified?: string | null // 最終通知日時
  isPaused: boolean // 一時停止状態
  pausedAt?: string | null // 一時停止開始日時
  timezone: string // 作成時のタイムゾーン
}

// アプリケーション設定
export interface AppSettings {
  notificationInterval: number // 通知チェック間隔（分）
  theme: 'light' | 'dark' | 'system'
  timezone: string // 現在のタイムゾーン
  lastTimezoneCheck: string // 最終タイムゾーンチェック日時
  notifications: {
    enabled: boolean
    permission: NotificationPermission | 'unsupported'
  }
  ui: {
    showWelcome: boolean // ウェルカム画面の表示
    compactMode: boolean // コンパクト表示モード
  }
}

// エクスポート/インポートデータ
export interface ExportData {
  version: string
  exportDate: string
  reminders: Reminder[]
  settings: AppSettings
  metadata?: {
    userAgent?: string
    timezone?: string
  }
}

// インポート時の重複処理オプション
export type DuplicateAction = 'skip' | 'overwrite' | 'merge'

// インポート結果
export interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  errors: string[]
  duplicates: Array<{
    existing: Reminder
    new: Reminder
    action: DuplicateAction
  }>
}

// タイムゾーン変更検出結果
export interface TimezoneChangeDetection {
  changed: boolean
  previous: string
  current: string
  affectedReminders: Reminder[]
}

// 通知データ（Service Worker用）
export interface NotificationData {
  reminderId: string
  title: string
  body: string
  url: string
  icon?: string
  badge?: string
  tag: string
  timestamp: string
}

// Service Workerメッセージの型
export interface ServiceWorkerMessage {
  type: 'GET_REMINDERS' | 'REMINDERS_DATA' | 'GET_SETTINGS' | 'SETTINGS_DATA' | 
        'NOTIFICATION_SENT' | 'CONFIRM_REMINDER' | 'CHECK_REMINDERS_NOW' | 
        'START_PERIODIC_CHECK' | 'UPDATE_CHECK_INTERVAL' | 'TIMEZONE_CHANGED'
  reminderId?: string
  timestamp?: string
  data?: any
}

// 通知履歴（将来の拡張用）
export interface NotificationHistory {
  id: string
  reminderId: string
  sentAt: string
  clicked: boolean
  action?: 'open' | 'confirm' | 'dismiss'
}

// フィルター・検索設定
export interface FilterSettings {
  searchTerm: string
  selectedTags: string[]
  showPaused: boolean
  dateRange?: {
    start: string
    end: string
  }
}

// ソート設定
export type SortField = 'lastNotified' | 'nextNotification' | 'createdAt' | 'title'
export type SortOrder = 'asc' | 'desc'

export interface SortSettings {
  field: SortField
  order: SortOrder
}

// アプリの状態管理用
export interface AppState {
  currentView: 'dashboard' | 'create' | 'edit' | 'settings'
  editingReminder: Reminder | null
  filter: FilterSettings
  sort: SortSettings
  isLoading: boolean
  error: string | null
}

// API関連の型（将来の拡張用）
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  timestamp: string
}