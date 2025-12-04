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

// 次の通知日時を計算
export const calculateNextNotificationTime = (
  schedule: Schedule,
  searchFrom: Date = new Date(), // 探索を開始する日時
): Date => {
  const candidate = new Date(searchFrom.getTime()); // searchFrom のコピーを作成
  candidate.setSeconds(0, 0); // 秒とミリ秒をリセット

  // 初期設定として、予定時刻を候補日に設定
  candidate.setHours(schedule.hour, schedule.minute, 0, 0);

  // もし初期候補日時が searchFrom より前であれば、1日進める
  if (candidate.getTime() < searchFrom.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }

  let iterations = 0;
  const MAX_ITERATIONS = 366 * 2; // 無限ループ防止のため最大試行回数を設定 (約2年間)

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    switch (schedule.type) {
      case "daily": {
        // daily では、interval ごとに日付を進める
        if (schedule.interval && schedule.interval > 1) {
          // baseDate からのオフセットを計算して、interval に合わせる必要がある
          // 現状は daily の interval は常に 1
          // したがって、日付を進めるだけで良い
        }

        // 日付フィルター適用
        adjustForDateFilter(candidate, schedule.dateFilter, 1); // daily は1日ごと

        // フィルター適用後も searchFrom より前なら、さらに進める
        if (candidate.getTime() < searchFrom.getTime()) {
          candidate.setDate(candidate.getDate() + (schedule.interval || 1));
          continue;
        }

        return candidate;
      }

      case "interval": {
        // baseDate を考慮し、かつ searchFrom 以降で最も近い interval の日を見つける
        // outer while loop が baseDate を考慮した searchFrom を渡すことを期待する
        // calculateNextNotificationTime は単純に searchFrom 以降の次の interval の日を探す
        return candidate;
      }

      case "weekly": {
        const targetDayOfWeek = schedule.dayOfWeek!;
        const currentDayOfWeek = candidate.getDay();

        // 曜日が一致しない、または一致しても searchFrom より前なら日付を進める
        if (currentDayOfWeek !== targetDayOfWeek) {
          const daysToAdd = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
          candidate.setDate(candidate.getDate() + daysToAdd);
          candidate.setHours(schedule.hour, schedule.minute, 0, 0); // 時刻再設定
          // 日付が変わったので、searchFrom との比較のために再評価
          if (candidate.getTime() < searchFrom.getTime()) {
            candidate.setDate(
              candidate.getDate() + (schedule.interval || 1) * 7,
            );
          }
          return candidate;
        }

        // 曜日が一致し、時刻も searchFrom 以降であればOK
        if (candidate.getTime() >= searchFrom.getTime()) {
          return candidate;
        } else {
          // 曜日が一致しているが時刻が searchFrom より前の場合、次の interval の週へ
          candidate.setDate(candidate.getDate() + (schedule.interval || 1) * 7);
          candidate.setHours(schedule.hour, schedule.minute, 0, 0); // 時刻再設定
          return candidate;
        }
      }

      case "specific_days": {
        if (!schedule.selectedDays || schedule.selectedDays.length === 0) {
          return candidate; // 選択された曜日がなければ現状維持 (エラー回避)
        }

        const isTargetDay = schedule.selectedDays.includes(candidate.getDay());

        // 選択された曜日であり、かつ時刻が searchFrom 以降であればOK
        if (isTargetDay && candidate.getTime() >= searchFrom.getTime()) {
          return candidate;
        } else {
          // 選択された曜日ではない、または時刻が searchFrom より前の場合、次の日へ
          candidate.setDate(candidate.getDate() + 1);
          candidate.setHours(schedule.hour, schedule.minute, 0, 0); // 時刻再設定
          // continue; // 再評価のためループを継続
        }
        break; // ループの最後で再評価される
      }

      case "monthly": {
        const targetWeekOfMonth = schedule.weekOfMonth!;
        const targetDayOfWeek = schedule.dayOfWeek!;

        // 候補日が含まれる月の第N週の指定曜日を計算
        const firstDayOfMonth = new Date(
          candidate.getFullYear(),
          candidate.getMonth(),
          1,
        );
        const calculatedDate = new Date(firstDayOfMonth);

        // 月の最初の targetDayOfWeek を見つける
        while (calculatedDate.getDay() !== targetDayOfWeek) {
          calculatedDate.setDate(calculatedDate.getDate() + 1);
        }
        // 第N週目に調整
        calculatedDate.setDate(
          calculatedDate.getDate() + (targetWeekOfMonth - 1) * 7,
        );
        calculatedDate.setHours(schedule.hour, schedule.minute, 0, 0);

        // 計算された日付が現在の月の範囲内にあるか
        if (calculatedDate.getMonth() === candidate.getMonth()) {
          // 月は同じ。時刻が searchFrom 以降であればOK
          if (calculatedDate.getTime() >= searchFrom.getTime()) {
            return calculatedDate;
          } else {
            // 同じ月の予定だが時刻が過ぎているので、次の月を探す
            candidate.setMonth(candidate.getMonth() + 1, 1); // 次の月の1日にセット
            continue;
          }
        } else {
          // 計算された日付が次の月になっている場合、その月で再評価
          candidate.setMonth(candidate.getMonth() + 1, 1); // 次の月の1日にセット
          continue;
        }
      }
    }
    // ここに到達した場合は、まだ適切な日付が見つかっていない
    candidate.setDate(candidate.getDate() + 1); // 1日進めてループを継続
  }

  // MAX_ITERATIONS に達した場合
  console.warn(
    "calculateNextNotificationTime reached MAX_ITERATIONS. This might indicate an issue with the scheduling logic. Returning a fallback date.",
  );
  candidate.setDate(candidate.getDate() + 365); // フォールバックとして1年後を返す
  return candidate;
};

// 日付フィルターを適用（平日・週末）
const adjustForDateFilter = (
  date: Date,
  filter: DateFilterType | undefined,
  _interval: number,
): void => {
  if (filter === undefined || filter === "all") return;

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

    // 既に通知済み、または計算された時刻が過去の場合、次の候補を計算
    // candidate を適切な未来の日付まで「早送り」する
    while (
      (lastNotified && candidate.getTime() <= lastNotified.getTime()) ||
      candidate.getTime() <= now.getTime()
    ) {
      // calculateNextNotificationTime は searchFrom 以降の次のスケジュールを返す
      // そのため、次の候補は現在の candidate の「次」であるべき
      // ここで1分進める代わりに、candidate の日付を1日進めてから
      // calculateNextNotificationTime を呼び出すことで、次の周期を探索させる
      const nextSearchFrom = new Date(candidate.getTime());
      nextSearchFrom.setDate(nextSearchFrom.getDate() + 1); // 少なくとも1日進める
      candidate = calculateNextNotificationTime(
        reminder.schedule,
        nextSearchFrom,
      );
    }

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
