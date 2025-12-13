// api/utils/type-guards.js

/**
 * @typedef {'daily' | 'weekly' | 'monthly' | 'interval' | 'specific_days'} ScheduleType
 * @typedef {'all' | 'weekdays' | 'weekends'} DateFilterType
 *
 * @typedef {object} Schedule
 * @property {ScheduleType} type
 * @property {number} interval
 * @property {number} hour
 * @property {number} minute
 * @property {DateFilterType} [dateFilter]
 * @property {number[]} [selectedDays]
 * @property {number} [dayOfWeek]
 * @property {number} [weekOfMonth]
 *
 * @typedef {object} Reminder
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {Schedule} schedule
 * @property {string[]} tags
 * @property {string} createdAt
 * @property {boolean} isPaused
 * @property {string} timezone
 * @property {string | null} [lastNotified]
 * @property {string | null} [pausedAt]
 * @property {'pending' | 'failed'} [status]
 * @property {number} [retryCount]
 */

/**
 * @param {unknown} type
 * @returns {type is ScheduleType}
 */
const isScheduleType = (type) => {
  return (
    typeof type === "string" &&
    ["daily", "weekly", "monthly", "interval", "specific_days"].includes(type)
  );
};

/**
 * @param {unknown} type
 * @returns {type is DateFilterType}
 */
const isDateFilterType = (type) => {
  return (
    typeof type === "string" && ["all", "weekdays", "weekends"].includes(type)
  );
};

/**
 * @param {unknown} obj
 * @returns {obj is Schedule}
 */
export const isSchedule = (obj) => {
  if (typeof obj !== "object" || obj === null) return false;
  const o = /** @type {Record<string, unknown>} */ (obj);

  return (
    isScheduleType(o.type) &&
    typeof o.interval === "number" &&
    typeof o.hour === "number" &&
    typeof o.minute === "number" &&
    (o.dateFilter === undefined || isDateFilterType(o.dateFilter)) &&
    (o.selectedDays === undefined ||
      (Array.isArray(o.selectedDays) &&
        o.selectedDays.every((day) => typeof day === "number"))) &&
    (o.dayOfWeek === undefined || typeof o.dayOfWeek === "number") &&
    (o.weekOfMonth === undefined || typeof o.weekOfMonth === "number")
  );
};

/**
 * @param {unknown} obj
 * @returns {obj is Reminder}
 */
export const isReminder = (obj) => {
  if (typeof obj !== "object" || obj === null) return false;
  const o = /** @type {Record<string, unknown>} */ (obj);

  const baseCheck =
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.url === "string" &&
    isSchedule(o.schedule) &&
    Array.isArray(o.tags) &&
    o.tags.every((tag) => typeof tag === "string") &&
    typeof o.createdAt === "string" &&
    // isPausedはオプショナルかもしれないので、存在チェックを追加
    (o.isPaused === undefined || typeof o.isPaused === "boolean") &&
    typeof o.timezone === "string" &&
    (o.lastNotified === undefined ||
      o.lastNotified === null ||
      typeof o.lastNotified === "string") &&
    (o.pausedAt === undefined ||
      o.pausedAt === null ||
      typeof o.pausedAt === "string");

  // statusとretryCountはオプショナル
  const statusCheck =
    o.status === undefined ||
    (typeof o.status === "string" && ["pending", "failed"].includes(o.status));
  const retryCountCheck =
    o.retryCount === undefined || typeof o.retryCount === "number";

  return baseCheck && statusCheck && retryCountCheck;
};
