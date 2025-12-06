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
      // 月末を正しく処理するため、一度翌月の1日に設定
      newDate.setMonth(newDate.getMonth() + 1, 1);
      break;
    default:
      // 不明なタイプの場合は日付を進めず、ループを終了させる
      newDate.setDate(newDate.getDate() + 1);
  }
  return newDate;
};

// 曜日フィルターを適用
const applyDayFilter = (date, schedule) => {
  const { dateFilter, selectedDays } = schedule;
  const isSpecificDays = schedule.type === "specific_days";

  if (dateFilter === "all" && !isSpecificDays) {
    return true; // フィルターなし
  }

  const dayOfWeek = date.getDay();

  if (isSpecificDays) {
    return selectedDays.includes(dayOfWeek);
  }

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (dateFilter === "weekdays") return !isWeekend;
  if (dateFilter === "weekends") return isWeekend;

  return true;
};

// 月の第N週の特定曜日を計算する
const getNthDayOfMonth = (year, month, schedule) => {
  const { weekOfMonth, dayOfWeek, hour, minute } = schedule;
  // 月の最初の該当日を探す
  let d = new Date(year, month, 1, hour, minute, 0, 0);
  while (d.getDay() !== dayOfWeek) {
    d.setDate(d.getDate() + 1);
  }
  // 第N週まで進める
  d.setDate(d.getDate() + (weekOfMonth - 1) * 7);

  // 月が変わってしまったら（例: 第5週が存在しない月）、その月は該当なし
  return d.getMonth() === month ? d : null;
};

// 次の通知日時を計算するメイン関数
export const calculateNextNotificationTime = (
  schedule,
  startPoint = new Date(),
) => {
  let candidate = new Date(startPoint);
  candidate.setHours(schedule.hour, schedule.minute, 0, 0);

  // 'monthly' スケジュールの場合、最初の候補を計算
  if (schedule.type === "monthly") {
    let monthlyCandidate = getNthDayOfMonth(
      candidate.getFullYear(),
      candidate.getMonth(),
      schedule,
    );

    // 最初の候補が過去なら、来月から探し直す
    if (
      !monthlyCandidate ||
      monthlyCandidate.getTime() <= startPoint.getTime()
    ) {
      let nextMonth = new Date(startPoint);
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
      monthlyCandidate = getNthDayOfMonth(
        nextMonth.getFullYear(),
        nextMonth.getMonth(),
        schedule,
      );
    }
    candidate = monthlyCandidate;
  }

  if (!candidate) return null; // monthlyで見つからなかった場合

  let attempts = 0;
  const maxAttempts = 365; // 1年先まで探して見つからなければ諦める

  while (
    candidate.getTime() <= startPoint.getTime() ||
    !applyDayFilter(candidate, schedule)
  ) {
    if (attempts++ > maxAttempts) return null; // 無限ループ防止
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
        // 該当月になければ次の月へ
        candidate.setMonth(candidate.getMonth() + 1, 1);
      }
    }
    // 時刻を再設定
    candidate.setHours(schedule.hour, schedule.minute, 0, 0);
  }

  return candidate;
};
