import { Schedule, DateFilterType } from "../types";

// ユニークIDを生成
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// 日付フォーマット関連
export const formatDate = (
  date: Date | string,
  options?: Intl.DateTimeFormatOptions,
): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  return dateObj.toLocaleString("ja-JP", { ...defaultOptions, ...options });
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

// 次の通知日時を計算（当日判定ロジック追加）
export const calculateNextNotificationTime = (
  schedule: Schedule,
  baseDate: Date = new Date(),
): Date => {
  const now = new Date(baseDate);
  let nextDate = new Date(baseDate);
  
  // 基本的な時刻設定
  const hour = schedule.hour;
  const minute = schedule.minute;

  switch (schedule.type) {
    case "daily": {
      // 当日の指定時刻を計算
      const todayTarget = new Date(now);
      todayTarget.setHours(hour, minute, 0, 0);
      
      // 指定時刻が未来の場合は当日、過去の場合は翌日以降
      if (todayTarget.getTime() > now.getTime()) {
        nextDate = todayTarget;
      } else {
        nextDate.setDate(now.getDate() + (schedule.interval || 1));
      }

      // 平日・週末フィルターを適用
      if (schedule.dateFilter && nextDate.toDateString() !== todayTarget.toDateString()) {
        adjustForDateFilter(nextDate, schedule.dateFilter, schedule.interval || 1);
      }
      break;
    }

    case "interval": {
      // 当日の指定時刻を計算
      const todayTarget = new Date(now);
      todayTarget.setHours(hour, minute, 0, 0);
      
      // 新規作成時は当日判定、それ以外は間隔通り
      if (todayTarget.getTime() > now.getTime()) {
        nextDate = todayTarget;
      } else {
        nextDate.setDate(now.getDate() + schedule.interval);
      }
      break;
    }

    case "weekly": {
      const targetDay = schedule.dayOfWeek!;
      const currentDay = now.getDay();
      
      // 当日が対象曜日かチェック
      if (currentDay === targetDay) {
        const todayTarget = new Date(now);
        todayTarget.setHours(hour, minute, 0, 0);
        
        // 当日の指定時刻が未来の場合は当日
        if (todayTarget.getTime() > now.getTime()) {
          nextDate = todayTarget;
          break;
        }
      }
      
      // 次の対象曜日を計算
      const daysUntilTarget = (targetDay - currentDay + 7) % 7;
      const weeklyDaysToAdd = daysUntilTarget === 0 ? 7 * (schedule.interval || 1) : daysUntilTarget;
      nextDate.setDate(now.getDate() + weeklyDaysToAdd);
      break;
    }

    case "specific_days": {
      // 特定の曜日（複数選択）
      if (schedule.selectedDays && schedule.selectedDays.length > 0) {
        const today = now.getDay();
        
        // 当日が対象曜日に含まれるかチェック
        if (schedule.selectedDays.includes(today)) {
          const todayTarget = new Date(now);
          todayTarget.setHours(hour, minute, 0, 0);
          
          // 当日の指定時刻が未来の場合は当日
          if (todayTarget.getTime() > now.getTime()) {
            nextDate = todayTarget;
            break;
          }
        }
        
        // 次の対象曜日を見つける
        let nextDay = schedule.selectedDays.find((day) => day > today);

        if (nextDay === undefined) {
          // 今週に該当する曜日がない場合は来週の最初の曜日
          nextDay = schedule.selectedDays[0];
          const daysToAdd = (nextDay - today + 7) % 7 || 7;
          nextDate.setDate(now.getDate() + daysToAdd);
        } else {
          // 今週の該当する曜日
          nextDate.setDate(now.getDate() + (nextDay - today));
        }
      }
      break;
    }

    case "monthly": {
      const targetWeek = schedule.weekOfMonth!;
      const targetDay = schedule.dayOfWeek!;
      
      // 今月の対象日を計算
      const thisMonthTarget = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // その月の最初の指定曜日を見つける
      while (thisMonthTarget.getDay() !== targetDay) {
        thisMonthTarget.setDate(thisMonthTarget.getDate() + 1);
      }
      
      // N週目に調整
      thisMonthTarget.setDate(thisMonthTarget.getDate() + (targetWeek - 1) * 7);
      thisMonthTarget.setHours(hour, minute, 0, 0);
      
      // 今月の対象日が未来の場合は今月、過去の場合は来月
      if (thisMonthTarget.getTime() > now.getTime()) {
        nextDate = thisMonthTarget;
      } else {
        // 来月の第n週のx曜日を計算
        nextDate.setMonth(now.getMonth() + 1, 1);
        const firstDayOfMonth = nextDate.getDay();
        const monthlyDaysToAdd =
          ((targetDay - firstDayOfMonth + 7) % 7) + (targetWeek - 1) * 7;
        nextDate.setDate(1 + monthlyDaysToAdd);

        // 該当する日が存在しない場合（第5週など）
        if (nextDate.getMonth() !== (now.getMonth() + 1) % 12) {
          // 次の月を試す
          nextDate.setMonth(now.getMonth() + 2, 1);
          const nextFirstDay = nextDate.getDay();
          const nextMonthDaysToAdd =
            ((targetDay - nextFirstDay + 7) % 7) + (targetWeek - 1) * 7;
          nextDate.setDate(1 + nextMonthDaysToAdd);
        }
      }
      break;
    }
  }

  // 時刻設定（monthly以外）
  if (schedule.type !== "monthly") {
    nextDate.setHours(hour, minute, 0, 0);
  }

  return nextDate;
};

// 日付フィルターを適用（平日・週末）
const adjustForDateFilter = (
  date: Date,
  filter: DateFilterType,
  _interval: number,
): void => {
  if (filter === "all") return;

  let attempts = 0;
  const maxAttempts = 14; // 無限ループを防ぐ

  while (attempts < maxAttempts) {
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isWeekday = !isWeekend;

    if (
      (filter === "weekdays" && isWeekday) ||
      (filter === "weekends" && isWeekend)
    ) {
      break;
    }

    date.setDate(date.getDate() + 1);
    attempts++;
  }
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
export const generateScheduleDescription = (schedule: Schedule): string => {
  switch (schedule.type) {
    case "daily": {
      let desc = "毎日";
      if (schedule.dateFilter === "weekdays") desc += "（平日のみ）";
      if (schedule.dateFilter === "weekends") desc += "（週末のみ）";
      desc += ` ${formatTime(schedule.hour, schedule.minute)}`;
      return desc;
    }

    case "interval": {
      return `${schedule.interval}日ごと ${formatTime(schedule.hour, schedule.minute)}`;
    }

    case "weekly": {
      const dayName = getDayName(schedule.dayOfWeek!);
      const weekInterval =
        schedule.interval === 1 ? "毎週" : `${schedule.interval}週間ごと`;
      return `${weekInterval}${dayName}曜日 ${formatTime(schedule.hour, schedule.minute)}`;
    }

    case "specific_days": {
      if (schedule.selectedDays && schedule.selectedDays.length > 0) {
        const dayNames = schedule.selectedDays
          .sort()
          .map((day) => getDayName(day))
          .join("・");
        return `毎週${dayNames}曜日 ${formatTime(schedule.hour, schedule.minute)}`;
      }
      return `特定の曜日 ${formatTime(schedule.hour, schedule.minute)}`;
    }

    case "monthly": {
      const weekName = getWeekName(schedule.weekOfMonth!);
      const monthlyDayName = getDayName(schedule.dayOfWeek!);
      return `毎月${weekName}${monthlyDayName}曜日 ${formatTime(schedule.hour, schedule.minute)}`;
    }

    default: {
      return "未設定";
    }
  }
};

// URLの妥当性をチェック
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
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

// デバウンス関数 - any型を具体的な関数型に修正
export const debounce = <T extends (...args: unknown[]) => unknown>(
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
