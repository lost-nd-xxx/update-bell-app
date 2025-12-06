// api/utils/notification-helpers.js

// 日付フィルターを適用（平日・週末）
const adjustForDateFilter = (date, filter) => {
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

// 次の通知日時を計算
export const calculateNextNotificationTime = (
  schedule,
  startPoint = new Date(),
) => {
  let candidate = new Date(startPoint);

  // スケジュールされた時刻を候補日に設定
  candidate.setHours(schedule.hour, schedule.minute, 0, 0);

  // 候補日が過去の場合、未来の最も近いスケジュール時刻まで進める
  const advanceToNext = () => {
    switch (schedule.type) {
      case "daily":
        candidate.setDate(candidate.getDate() + (schedule.interval || 1));
        adjustForDateFilter(candidate, schedule.dateFilter);
        break;
      case "weekly":
        // 次の週の同じ曜日に進める
        candidate.setDate(candidate.getDate() + 7 * (schedule.interval || 1));
        break;
      case "monthly":
        // 次の月に進める
        candidate.setMonth(candidate.getMonth() + 1, 1); // 翌月の1日に設定
        // 再計算が必要
        return calculateNextNotificationTime(schedule, candidate);
      case "specific_days":
        // 次の日に進めて、次の適合する曜日を探す
        candidate.setDate(candidate.getDate() + 1);
        return calculateNextNotificationTime(schedule, candidate); // 再帰的に探索
      case "interval":
        candidate.setDate(candidate.getDate() + (schedule.interval || 1));
        break;
    }
  };

  if (candidate.getTime() <= startPoint.getTime()) {
    advanceToNext();
  }

  switch (schedule.type) {
    case "daily": {
      adjustForDateFilter(candidate, schedule.dateFilter);
      // adjustForDateFilterが未来に進めた結果、開始時刻より前になることはないはず
      break;
    }

    case "weekly": {
      const targetDay = schedule.dayOfWeek;
      let currentDay = candidate.getDay();

      if (currentDay !== targetDay) {
        const daysUntilTarget = (targetDay - currentDay + 7) % 7;
        candidate.setDate(candidate.getDate() + daysUntilTarget);
      }

      // 候補日が過去、または同じ日だが時刻が過ぎている場合は、次のインターバルに進める
      if (candidate.getTime() <= startPoint.getTime()) {
        candidate.setDate(candidate.getDate() + 7 * (schedule.interval || 1));
      }
      break;
    }

    case "specific_days": {
      if (!schedule.selectedDays || schedule.selectedDays.length === 0) {
        return null;
      }
      let found = false;
      for (let i = 0; i < 7; i++) {
        const currentDayOfWeek = candidate.getDay();
        if (schedule.selectedDays.includes(currentDayOfWeek)) {
          if (candidate.getTime() > startPoint.getTime()) {
            found = true;
            break;
          }
        }
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(schedule.hour, schedule.minute, 0, 0);
      }
      if (!found) {
        // 1週間探しても見つからない場合、来週の最初の該当日時
        candidate.setDate(
          candidate.getDate() +
            (7 - candidate.getDay()) +
            schedule.selectedDays[0],
        );
      }
      break;
    }

    case "monthly": {
      const targetWeek = schedule.weekOfMonth;
      const targetDay = schedule.dayOfWeek;

      // 月の最初の指定曜日を見つける
      const findNthDayOfMonth = (year, month) => {
        let d = new Date(year, month, 1);
        d.setHours(schedule.hour, schedule.minute, 0, 0);
        // 最初の指定曜日まで進める
        while (d.getDay() !== targetDay) {
          d.setDate(d.getDate() + 1);
        }
        // 第N週まで進める
        d.setDate(d.getDate() + (targetWeek - 1) * 7);

        // もし月が変わってしまったら（例: 第5週が存在しない月）、その月の候補はない
        if (d.getMonth() !== month) return null;
        return d;
      };

      let tempCandidate = findNthDayOfMonth(
        startPoint.getFullYear(),
        startPoint.getMonth(),
      );

      // 候補がないか、過去の日付なら次の月へ
      if (!tempCandidate || tempCandidate.getTime() <= startPoint.getTime()) {
        tempCandidate = findNthDayOfMonth(
          startPoint.getFullYear(),
          startPoint.getMonth() + 1,
        );
      }
      // さらに次の月もチェック
      if (!tempCandidate) {
        tempCandidate = findNthDayOfMonth(
          startPoint.getFullYear(),
          startPoint.getMonth() + 2,
        );
      }
      candidate = tempCandidate;

      if (!candidate) return null; // 適切な日が見つからなかった
      break;
    }
  }

  return candidate;
};
