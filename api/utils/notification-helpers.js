// api/utils/notification-helpers.js

// 1ステップだけ次の候補日時へ進めるヘルパー関数
const advanceToNext = (date, schedule) => {
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
const applyDayFilter = (date, schedule) => {
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
const getNthDayOfMonth = (year, month, schedule) => {
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
  schedule,
  startPoint = new Date(),
) => {
  let candidate = new Date(startPoint);
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

  if (!candidate) return null;

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
