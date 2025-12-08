import React from "react";
import {
  Tag,
  Edit,
  Trash2,
  Play,
  Pause,
  ExternalLink,
  Clock,
  Calendar,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Reminder } from "../types";
import {
  formatRelativeTime,
  generateScheduleDescription,
  extractDomain,
  normalizeUrl,
} from "../utils/helpers";

interface ReminderCardProps {
  reminder: Reminder;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePause: (isPaused: boolean) => void;
  processingIds: Record<string, "deleting" | "saving">;
  nextNotificationTime?: Date | null;
}

const ReminderCard: React.FC<ReminderCardProps> = ({
  reminder,
  onEdit,
  onDelete,
  onTogglePause,
  processingIds,
}) => {
  const scheduleDescription = generateScheduleDescription(reminder.schedule);
  const domain = extractDomain(reminder.url);
  const isDeleting = processingIds[reminder.id] === "deleting";
  const isSaving = processingIds[reminder.id] === "saving";
  const isFailedAndPaused =
    reminder.isPaused && (reminder.retryCount || 0) >= 3;

  return (
    <div
      className={`card p-6 border-l-4 transition-all hover:shadow-md relative ${
        isDeleting
          ? "border-gray-300 bg-gray-100 dark:bg-gray-800/50"
          : isFailedAndPaused
            ? "border-red-500 bg-red-50/50 dark:bg-red-900/10"
            : reminder.isPaused
              ? "border-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10"
              : "border-purple-500 bg-white dark:bg-gray-800"
      }`}
    >
      {(isDeleting || isSaving) && (
        <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 flex items-center justify-center rounded-lg z-10">
          <Loader2 className="animate-spin text-gray-500" size={32} />
        </div>
      )}
      <div className="flex flex-wrap justify-between items-start mb-4 gap-y-2">
        <div className="flex-1 min-w-0 sm:flex-none sm:w-auto">
          <div className="flex items-center gap-2 mb-2 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2">
              {reminder.title}
            </h3>
            {reminder.isPaused && (
              <span className="tag tag-yellow text-yellow-800 dark:text-yellow-200">
                一時停止中
              </span>
            )}
          </div>

          <a
            href={reminder.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline text-sm group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="truncate">
              {domain}
              {(() => {
                try {
                  const normalizedUrl = normalizeUrl(reminder.url);
                  const urlObj = new URL(normalizedUrl);
                  if (urlObj.pathname !== "/" || urlObj.search || urlObj.hash) {
                    return " ...";
                  }
                } catch (_e) {
                  void _e;
                }
                return "";
              })()}
            </span>
            <ExternalLink
              size={14}
              className="flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
            />
          </a>
        </div>

        <div className="flex items-center gap-1 sm:ml-4">
          <button
            onClick={() => onTogglePause(!reminder.isPaused)}
            disabled={isDeleting || isSaving}
            className={`p-2 rounded-lg transition-colors border disabled:opacity-50 disabled:cursor-not-allowed ${
              reminder.isPaused
                ? "border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30"
                : "border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
            }`}
            title={reminder.isPaused ? "再開" : "一時停止"}
          >
            {reminder.isPaused ? <Play size={16} /> : <Pause size={16} />}
          </button>

          <button
            onClick={onEdit}
            disabled={isDeleting || isSaving}
            className="p-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="編集"
          >
            <Edit size={16} />
          </button>

          <button
            onClick={onDelete}
            disabled={isDeleting || isSaving}
            className="p-2 border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="削除"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {isFailedAndPaused && (
        <div className="mt-2 mb-4 p-3 rounded-md bg-red-100 dark:bg-red-900/30">
          <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium">
              通知の失敗が続いたため、自動で一時停止されました。
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
          <Clock size={16} className="flex-shrink-0" />
          <span>{scheduleDescription}</span>
        </div>

        {reminder.nextNotificationTime && (
          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
            <Calendar size={16} className="flex-shrink-0" />
            <span>
              次回:{" "}
              {reminder.nextNotificationTime.toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
          <Calendar size={16} className="flex-shrink-0" />
          <span>
            最終通知:{" "}
            {reminder.lastNotified
              ? formatRelativeTime(reminder.lastNotified)
              : "未通知"}
          </span>
        </div>

        {reminder.tags && reminder.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <Tag size={16} className="flex-shrink-0" />
            <div className="flex gap-1 flex-wrap">
              {reminder.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-sm text-gray-600 dark:text-gray-400"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReminderCard;
