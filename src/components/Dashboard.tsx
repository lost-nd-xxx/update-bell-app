import React, { useMemo } from 'react'
import { Search, Bell, SortAsc, SortDesc } from 'lucide-react'
import { Reminder, AppState } from '../types'
import ReminderCard from './ReminderCard'
import TagFilter from './TagFilter'
import { generateScheduleDescription } from '../utils/helpers'

interface DashboardProps {
  reminders: Reminder[]
  filter: AppState['filter']
  sort: AppState['sort']
  onFilterChange: (filter: Partial<AppState['filter']>) => void
  onSortChange: (sort: Partial<AppState['sort']>) => void
  onEdit: (reminder: Reminder) => void
  onDelete: (id: string) => void
  onTogglePause: (id: string, isPaused: boolean) => void
  onCreateNew: () => void
}

const Dashboard: React.FC<DashboardProps> = ({
  reminders,
  filter,
  sort,
  onFilterChange,
  onSortChange,
  onEdit,
  onDelete,
  onTogglePause,
  onCreateNew
}) => {
  // フィルタリングとソート処理
  const filteredAndSortedReminders = useMemo(() => {
    let filtered = reminders.filter(reminder => {
      // 検索フィルター
      const matchesSearch = filter.searchTerm === '' || 
        reminder.title.toLowerCase().includes(filter.searchTerm.toLowerCase()) ||
        reminder.url.toLowerCase().includes(filter.searchTerm.toLowerCase())
      
      // タグフィルター
      const matchesTags = filter.selectedTags.length === 0 ||
        filter.selectedTags.every(tag => reminder.tags.includes(tag))
      
      // 一時停止フィルター
      const matchesPause = filter.showPaused || !reminder.isPaused
      
      return matchesSearch && matchesTags && matchesPause
    })

    // ソート処理
    filtered.sort((a, b) => {
      let comparison = 0
      
      switch (sort.field) {
        case 'lastNotified':
          const aTime = a.lastNotified || a.createdAt
          const bTime = b.lastNotified || b.createdAt
          comparison = new Date(bTime).getTime() - new Date(aTime).getTime()
          break
        case 'nextNotification':
          // 次回通知時刻でソート（実装は複雑になるため簡略化）
          comparison = a.schedule.hour - b.schedule.hour
          break
        case 'createdAt':
          comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          break
        case 'title':
          comparison = a.title.localeCompare(b.title, 'ja')
          break
      }
      
      return sort.order === 'desc' ? comparison : -comparison
    })

    return filtered
  }, [reminders, filter, sort])

  // 全てのタグを取得
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    reminders.forEach(reminder => {
      reminder.tags.forEach(tag => tags.add(tag))
    })
    return Array.from(tags).sort()
  }, [reminders])

  const toggleSortOrder = () => {
    onSortChange({ order: sort.order === 'asc' ? 'desc' : 'asc' })
  }

  const handleSortFieldChange = (field: AppState['sort']['field']) => {
    onSortChange({ field })
  }

  return (
    <div className="space-y-6">
      {/* 統計情報 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {reminders.length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            総リマインダー数
          </div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {reminders.filter(r => !r.isPaused).length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            アクティブ
          </div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {reminders.filter(r => r.isPaused).length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            一時停止中
          </div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {allTags.length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            タグ数
          </div>
        </div>
      </div>

      {/* 検索・フィルター */}
      <div className="card p-6">
        <div className="space-y-4">
          {/* 検索バー */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="タイトルやURLで検索..."
              value={filter.searchTerm}
              onChange={(e) => onFilterChange({ searchTerm: e.target.value })}
              className="input pl-10"
            />
          </div>

          {/* フィルターオプション */}
          <div className="flex flex-wrap items-center gap-4">
            {/* ソート設定 */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                並び順:
              </label>
              <select
                value={sort.field}
                onChange={(e) => handleSortFieldChange(e.target.value as AppState['sort']['field'])}
                className="input text-sm"
              >
                <option value="lastNotified">最終通知日時</option>
                <option value="nextNotification">次回通知日時</option>
                <option value="createdAt">作成日時</option>
                <option value="title">タイトル</option>
              </select>
              <button
                onClick={toggleSortOrder}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                title={sort.order === 'asc' ? '昇順' : '降順'}
              >
                {sort.order === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />}
              </button>
            </div>

            {/* 一時停止フィルター */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filter.showPaused}
                onChange={(e) => onFilterChange({ showPaused: e.target.checked })}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                一時停止中も表示
              </span>
            </label>
          </div>

          {/* タグフィルター */}
          {allTags.length > 0 && (
            <TagFilter
              allTags={allTags}
              selectedTags={filter.selectedTags}
              onTagToggle={(tag) => {
                const newSelectedTags = filter.selectedTags.includes(tag)
                  ? filter.selectedTags.filter(t => t !== tag)
                  : [...filter.selectedTags, tag]
                onFilterChange({ selectedTags: newSelectedTags })
              }}
            />
          )}
        </div>
      </div>

      {/* リマインダー一覧 */}
      <div className="space-y-4">
        {filteredAndSortedReminders.length === 0 ? (
          <div className="card p-12 text-center">
            <Bell className="mx-auto mb-4 text-gray-400" size={48} />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {reminders.length === 0 
                ? 'リマインダーがありません'
                : 'フィルター条件に一致するリマインダーがありません'
              }
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {reminders.length === 0
                ? '最初のリマインダーを作成してください'
                : '検索条件やフィルターを変更してください'
              }
            </p>
            {reminders.length === 0 && (
              <button
                onClick={onCreateNew}
                className="btn btn-primary"
              >
                リマインダーを作成
              </button>
            )}
          </div>
        ) : (
          filteredAndSortedReminders.map(reminder => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              onEdit={() => onEdit(reminder)}
              onDelete={() => onDelete(reminder.id)}
              onTogglePause={(isPaused) => onTogglePause(reminder.id, isPaused)}
            />
          ))
        )}
      </div>

      {/* 検索結果の情報 */}
      {filter.searchTerm || filter.selectedTags.length > 0 || !filter.showPaused ? (
        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          {filteredAndSortedReminders.length}件中{reminders.length}件を表示
        </div>
      ) : null}
    </div>
  )
}

export default Dashboard