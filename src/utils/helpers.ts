import { Schedule, DateFilterType, ScheduleType, Reminder } from "../types";

// ユニークIDを生成
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const formatTime = (hour: number, minute: number): string => {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

export const formatRelativeTime = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "たった今";
  if (diffMinutes < 60) return `${diffMinutes}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays < 7) return `${diffDays}日前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}週間前`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}ヶ月前`;
  return `${Math.floor(diffDays / 365)}年前`;
};

// 1ステップだけ次の候補日時へ進めるヘルパー関数
const advanceToNext = (date: Date, schedule: Schedule): Date => {
  const newDate = new Date(date);

  switch (schedule.type) {
    case "daily":
    case "interval":
      newDate.setDate(newDate.getDate() + (schedule.interval || 1));
      break;
    case "weekly":
      newDate.setDate(newDate.getDate() + 7 * (schedule.interval || 1));
      break;
    case "specific_days":
      newDate.setDate(newDate.getDate() + 1);
      break;
    case "monthly":
      newDate.setMonth(newDate.getMonth() + 1, 1);
      break;
    default:
      newDate.setDate(newDate.getDate() + 1);
  }
  return newDate;
};

// 曜日フィルターを適用
const applyDayFilter = (date: Date, schedule: Schedule): boolean => {
  const { dateFilter, selectedDays } = schedule;
  const isSpecificDays = schedule.type === "specific_days";

  if (dateFilter === "all" && !isSpecificDays) {
    return true;
  }

  const dayOfWeek = date.getDay();

  if (isSpecificDays) {
    return selectedDays?.includes(dayOfWeek) ?? false;
  }

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (dateFilter === "weekdays") return !isWeekend;
  if (dateFilter === "weekends") return isWeekend;

  return true;
};

// 月の第N週の特定曜日を計算する
const getNthDayOfMonth = (
  year: number,
  month: number,
  schedule: Schedule,
): Date | null => {
  const { weekOfMonth, dayOfWeek, hour, minute } = schedule;
  if (weekOfMonth === undefined || dayOfWeek === undefined) return null;

  const d = new Date(year, month, 1, hour, minute, 0, 0);
  while (d.getDay() !== dayOfWeek) {
    d.setDate(d.getDate() + 1);
  }
  d.setDate(d.getDate() + (weekOfMonth - 1) * 7);

  return d.getMonth() === month ? d : null;
};

// 次の通知日時を計算するメイン関数
export const calculateNextNotificationTime = (
  schedule: Schedule,
  startPoint: Date = new Date(),
): Date | null => {
  let candidate: Date | null = new Date(startPoint);
  candidate.setHours(schedule.hour, schedule.minute, 0, 0);

  if (schedule.type === "monthly") {
    let monthlyCandidate = getNthDayOfMonth(
      candidate.getFullYear(),
      candidate.getMonth(),
      schedule,
    );

    if (
      !monthlyCandidate ||
      monthlyCandidate.getTime() <= startPoint.getTime()
    ) {
      const nextMonth = new Date(startPoint);
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
      monthlyCandidate = getNthDayOfMonth(
        nextMonth.getFullYear(),
        nextMonth.getMonth(),
        schedule,
      );
    }
    candidate = monthlyCandidate;
  }

  if (!candidate) return null; // ここでnullチェック

  let attempts = 0;
  const maxAttempts = 365;

  while (
    candidate.getTime() <= startPoint.getTime() ||
    !applyDayFilter(candidate, schedule)
  ) {
    if (attempts++ > maxAttempts) return null;
    candidate = advanceToNext(candidate, schedule);

    if (schedule.type === "monthly") {
      const monthlyCandidate = getNthDayOfMonth(
        candidate.getFullYear(),
        candidate.getMonth(),
        schedule,
      );
      if (monthlyCandidate) {
        candidate = monthlyCandidate;
      } else {
        candidate.setMonth(candidate.getMonth() + 1, 1);
      }
    }
    candidate.setHours(schedule.hour, schedule.minute, 0, 0);
  }

  return candidate;
};

// 曜日名を取得
export const getDayName = (dayOfWeek: number): string => {
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return days[dayOfWeek] || "";
};

// 週番号を取得
export const getWeekName = (weekOfMonth: number): string => {
  const weeks = ["", "第1", "第2", "第3", "第4", "第5"];
  return weeks[weekOfMonth] || "";
};

// スケジュールの説明文を生成
export const generateScheduleDescription = (
  schedule: Schedule,
  baseDate?: string,
): string => {
  let desc: string;
  switch (schedule.type) {
    case "daily": {
      let dailyDesc = "毎日";
      if (schedule.dateFilter === "weekdays") dailyDesc += "（平日のみ）";
      if (schedule.dateFilter === "weekends") dailyDesc += "（週末のみ）";
      dailyDesc += ` ${formatTime(schedule.hour, schedule.minute)}`;
      desc = dailyDesc;
      break;
    }

    case "interval": {
      desc = `${schedule.interval}日ごと ${formatTime(schedule.hour, schedule.minute)}`;
      break;
    }

    case "weekly": {
      const dayName = getDayName(schedule.dayOfWeek!);
      const weekInterval =
        schedule.interval === 1 ? "毎週" : `${schedule.interval}週間ごと`;
      desc = `${weekInterval}${dayName}曜日 ${formatTime(schedule.hour, schedule.minute)}`;
      break;
    }

    case "specific_days": {
      if (schedule.selectedDays && schedule.selectedDays.length > 0) {
        const dayNames = schedule.selectedDays
          .sort()
          .map((day) => getDayName(day))
          .join("・");
        desc = `毎週${dayNames}曜日 ${formatTime(schedule.hour, schedule.minute)}`;
      } else {
        desc = `特定の曜日 ${formatTime(schedule.hour, schedule.minute)}`;
      }
      break;
    }

    case "monthly": {
      const weekName = getWeekName(schedule.weekOfMonth!);
      const monthlyDayName = getDayName(schedule.dayOfWeek!);
      desc = `毎月${weekName}${monthlyDayName}曜日 ${formatTime(
        schedule.hour,
        schedule.minute,
      )}`;
      break;
    }

    default: {
      return "未設定";
    }
  }

  if (baseDate) {
    try {
      const date = new Date(baseDate);
      // getTime()の返り値がNaNであるかどうかで、有効な日付かどうかを判定
      if (!isNaN(date.getTime())) {
        const formattedDate = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
        desc += ` (${formattedDate}基準)`;
      }
    } catch (_e) {
      void _e; // ESLint: 'e' is defined but never used. を回避
      // 無効な日付文字列の場合は何もしない
    }
  }

  return desc;
};

// URLの妥当性をチェック
export const isValidUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    // httpとhttpsプロトコルのみを許可
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
};

// URLを正規化（プロトコルを追加など）
export const normalizeUrl = (url: string): string => {
  if (!url) return "";

  // プロトコルがない場合はhttpsを追加
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }

  return url;
};

// URLからドメイン名を抽出
export const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(normalizeUrl(url));
    return urlObj.hostname;
  } catch {
    return url;
  }
};

// テキストをクリップボードにコピー
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // フォールバック方法
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return true;
    } catch {
      return false;
    }
  }
};

// ファイルダウンロード
export const downloadFile = (
  content: string,
  filename: string,
  mimeType: string = "application/json",
): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

// ファイル読み込み
export const readFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("ファイルの読み込みに失敗しました"));
      }
    };
    reader.onerror = () =>
      reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsText(file);
  });
};

// 配列をシャッフル
export const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// オブジェクトのディープコピー
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

// --- 型ガード関数 ---
const isScheduleType = (type: unknown): type is ScheduleType => {
  return (
    typeof type === "string" &&
    ["daily", "weekly", "monthly", "interval", "specific_days"].includes(type)
  );
};

const isDateFilterType = (type: unknown): type is DateFilterType => {
  return (
    typeof type === "string" && ["all", "weekdays", "weekends"].includes(type)
  );
};

export const isSchedule = (obj: unknown): obj is Schedule => {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;

  return (
    isScheduleType(o.type) &&
    typeof o.interval === "number" &&
    typeof o.hour === "number" &&
    typeof o.minute === "number" &&
    (o.dateFilter === undefined || isDateFilterType(o.dateFilter)) &&
    (o.selectedDays === undefined ||
      (Array.isArray(o.selectedDays) &&
        o.selectedDays.every((day: unknown) => typeof day === "number"))) &&
    (o.dayOfWeek === undefined || typeof o.dayOfWeek === "number") &&
    (o.weekOfMonth === undefined || typeof o.weekOfMonth === "number")
  );
};

export const isReminder = (obj: unknown): obj is Reminder => {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;

  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.url === "string" &&
    isSchedule(o.schedule) &&
    Array.isArray(o.tags) &&
    o.tags.every((tag: unknown) => typeof tag === "string") &&
    typeof o.createdAt === "string" &&
    typeof o.isPaused === "boolean" &&
    typeof o.timezone === "string" &&
    (o.lastNotified === undefined ||
      o.lastNotified === null ||
      typeof o.lastNotified === "string") &&
    (o.pausedAt === undefined ||
      o.pausedAt === null ||
      typeof o.pausedAt === "string")
  );
};

// デバウンス関数 - ジェネリック型を使用
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
};

// エラーメッセージを日本語化
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "予期しないエラーが発生しました";
};

// 次にスケジュールされるべき通知を計算する
export const calculateNextScheduledNotification = (
  reminders: import("../types").Reminder[],
): { reminder: import("../types").Reminder; scheduleTime: number } | null => {
  const now = new Date();
  let nextNotification = null;

  for (const reminder of reminders) {
    if (reminder.isPaused) continue;

    const lastNotified = reminder.lastNotified
      ? new Date(reminder.lastNotified)
      : null;

    const baseForCalc = reminder.baseDate ? new Date(reminder.baseDate) : now;
    let candidate = calculateNextNotificationTime(
      reminder.schedule,
      baseForCalc,
    );

    if (!candidate) continue; // calculateNextNotificationTimeがnullを返した場合

    // 既に通知済み、または計算された時刻が過去の場合、次の候補を計算
    while (
      (lastNotified && candidate.getTime() <= lastNotified.getTime()) ||
      candidate.getTime() <= now.getTime()
    ) {
      const nextSearchFrom = new Date(candidate.getTime());
      nextSearchFrom.setDate(nextSearchFrom.getDate() + 1); // 少なくとも1日進める
      candidate = calculateNextNotificationTime(
        reminder.schedule,
        nextSearchFrom,
      );
      if (!candidate) break; // 次の候補が見つからなければループを抜ける
    }
    if (!candidate) continue; // ループ中に候補がnullになった場合

    if (
      !nextNotification ||
      candidate.getTime() < nextNotification.scheduleTime
    ) {
      nextNotification = {
        reminder,
        scheduleTime: candidate.getTime(),
      };
    }
  }

  return nextNotification;
};
