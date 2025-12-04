// update-bell-app/api/cron/send-notifications.js
import { kv } from "@vercel/kv";

// --- ヘルパー関数 (ここから) ---

/**
 * Vercel環境ではVERCEL_URL、ローカルではlocalhostをベースにしたAPIエンドポイントを返す
 */
function getApiEndpoint() {
  const url = process.env.VERCEL_URL;
  if (url) {
    // Vercelのプレビュー環境などでは `https` が必要
    return `https://${url}`;
  }
  // ローカル開発用のデフォルト
  return "http://localhost:3000";
}

/**
 * 同じプロジェクト内の send-web-push API を呼び出す
 * @param {Array} subscriptions 購読情報の配列
 * @param {Array} payloads 通知ペイロードの配列
 * @returns {Promise<Object>} APIからのレスポンスJSON
 */
async function callSendWebPush(subscriptions, payloads) {
  const endpoint = getApiEndpoint();
  const apiUrl = `${endpoint}/api/send-web-push`;

  console.log(`[CRON] Calling internal API: ${apiUrl}`);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscriptions, payloads }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `[CRON] Failed to call send-web-push API. Status: ${response.status}. Body: ${errorText}`,
    );
    throw new Error(
      `Failed to call send-web-push: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

// 日付フィルターを適用（平日・週末）
const adjustForDateFilter = (date, filter, _interval) => {
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

// 次の通知日時を計算（helpers.tsから移植）
const calculateNextNotificationTime = (
  schedule,
  startPoint = new Date(), // 計算の起点となる日付（時刻も含む）
) => {
  let candidate = new Date(startPoint);
  candidate.setHours(schedule.hour, schedule.minute, 0, 0); // スケジュールの時刻をセット

  switch (schedule.type) {
    case "daily": {
      // startPointの時刻が既に候補日時の時刻を過ぎている場合、次のintervalへ
      if (startPoint.getTime() > candidate.getTime()) {
        candidate.setDate(candidate.getDate() + (schedule.interval || 1));
      }
      // 平日・週末フィルターを適用
      adjustForDateFilter(
        candidate,
        schedule.dateFilter,
        schedule.interval || 1,
      );
      break;
    }

    case "interval": {
      // startPointの時刻が既に候補日時の時刻を過ぎている場合、次のintervalへ
      if (startPoint.getTime() > candidate.getTime()) {
        candidate.setDate(startPoint.getDate() + schedule.interval);
        candidate.setHours(schedule.hour, schedule.minute, 0, 0);
      }

      // startPointからcandidateまでの日数差を計算
      const diffTime = candidate.getTime() - startPoint.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); // 日数差

      if (diffDays > 0 && diffDays % schedule.interval !== 0) {
        // intervalの倍数でない場合、最も近い次の倍数まで進める
        const remainder = diffDays % schedule.interval;
        candidate.setDate(
          candidate.getDate() + (schedule.interval - remainder),
        );
      } else if (diffDays < 0) {
        // startPointがcandidateより未来の時刻で、かつdiffDaysが負になるケース
        // 例: startPointが今日15時、candidateが今日10時。この場合も次のintervalへ
        candidate.setDate(startPoint.getDate() + schedule.interval);
        candidate.setHours(schedule.hour, schedule.minute, 0, 0);
      }
      break;
    }

    case "weekly": {
      const targetDay = schedule.dayOfWeek;
      let currentDay = startPoint.getDay();

      // まず、startPointの週でtargetDayの曜日まで移動
      if (currentDay !== targetDay) {
        const daysUntilTarget = (targetDay - currentDay + 7) % 7;
        candidate.setDate(startPoint.getDate() + daysUntilTarget);
        candidate.setHours(schedule.hour, schedule.minute, 0, 0);
      }

      // startPointからcandidateまでの週数差を計算
      // 時刻を考慮せずに日付部分のみで差を計算するため、一度日付のみに変換
      const startPointDateOnly = new Date(startPoint);
      startPointDateOnly.setHours(0, 0, 0, 0);
      const candidateDateOnly = new Date(candidate);
      candidateDateOnly.setHours(0, 0, 0, 0);

      const diffWeeks = Math.round(
        (candidateDateOnly.getTime() - startPointDateOnly.getTime()) /
          (1000 * 60 * 60 * 24 * 7),
      );

      if (diffWeeks < 0) {
        // candidateがstartPointより過去になることは通常ないが念のため
        // diffWeeksを0週と見なして計算を進める
        // あるいは、startPointから次のターゲット曜日を正しく見つけるロジックに調整
      }

      const interval = schedule.interval || 1;

      // diffWeeksがintervalの倍数でない、またはstartPointの時刻がcandidateの時刻を過ぎている場合
      if (
        diffWeeks % interval !== 0 ||
        (diffWeeks === 0 && startPoint.getTime() > candidate.getTime())
      ) {
        const remainder = diffWeeks % interval;
        const weeksToAdd = (interval - remainder) % interval; // 0ならinterval週追加、それ以外は差分週追加
        candidate.setDate(candidate.getDate() + weeksToAdd * 7);
      }
      break;
    }

    case "specific_days": {
      if (!schedule.selectedDays || schedule.selectedDays.length === 0) {
        return candidate; // 選択された曜日がない場合は変更なし
      }

      let found = false;
      let tempCandidate = new Date(startPoint);
      tempCandidate.setHours(schedule.hour, schedule.minute, 0, 0);

      for (let i = 0; i < 7; i++) {
        const day = tempCandidate.getDay();
        if (schedule.selectedDays.includes(day)) {
          // 選択された曜日の場合
          if (tempCandidate.getTime() >= startPoint.getTime()) {
            candidate = tempCandidate;
            found = true;
            break;
          }
        }
        tempCandidate.setDate(tempCandidate.getDate() + 1);
      }

      if (!found) {
        // 1週間探しても見つからなかった場合は、次の週の最初の選択された曜日
        tempCandidate = new Date(startPoint);
        tempCandidate.setDate(
          tempCandidate.getDate() +
            (7 - startPoint.getDay()) +
            schedule.selectedDays[0],
        );
        tempCandidate.setHours(schedule.hour, schedule.minute, 0, 0);
        candidate = tempCandidate;
      }
      break;
    }

    case "monthly": {
      const targetWeek = schedule.weekOfMonth;
      const targetDay = schedule.dayOfWeek;

      let tempCandidate = new Date(
        startPoint.getFullYear(),
        startPoint.getMonth(),
        1,
      );
      tempCandidate.setHours(schedule.hour, schedule.minute, 0, 0);

      // 月の最初の指定曜日を見つける
      while (tempCandidate.getDay() !== targetDay) {
        tempCandidate.setDate(tempCandidate.getDate() + 1);
      }

      // 第N週目に調整
      tempCandidate.setDate(tempCandidate.getDate() + (targetWeek - 1) * 7);

      candidate = tempCandidate;

      // 候補日がstartPointの時刻より過去の場合、次の月を探す
      if (candidate.getTime() < startPoint.getTime()) {
        // 次の月で再計算
        candidate.setMonth(startPoint.getMonth() + 1);
        candidate.setDate(1); // 1日にリセット
        candidate.setHours(schedule.hour, schedule.minute, 0, 0);

        // 月の最初の指定曜日を見つける
        while (candidate.getDay() !== targetDay) {
          candidate.setDate(candidate.getDate() + 1);
        }
        candidate.setDate(candidate.getDate() + (targetWeek - 1) * 7);
      }
      // 最終チェック: 設定された日がその月に存在しない場合 (例: 第5週)
      // 月が変わってしまっている場合はさらに1ヶ月進める
      if (
        candidate.getMonth() !==
        (startPoint.getMonth() +
          (candidate.getTime() < startPoint.getTime() ? 1 : 0)) %
          12
      ) {
        candidate.setMonth(candidate.getMonth() + 1);
        candidate.setDate(1);
        candidate.setHours(schedule.hour, schedule.minute, 0, 0);
        while (candidate.getDay() !== targetDay) {
          candidate.setDate(candidate.getDate() + 1);
        }
        candidate.setDate(candidate.getDate() + (targetWeek - 1) * 7);
      }
      break;
    }
  }

  // 時刻は既に設定済み
  return candidate;
};
// --- ヘルパー関数 (ここまで) ---

/**
 * Vercel Cron から呼び出されるハンドラ
 */
export default async function handler(request, response) {
  // Vercel Cronからのリクエストか、適切なBearerトークンを持つリクエストかを認証
  if (
    process.env.CRON_SECRET &&
    request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  console.log(
    `[CRON] --- Notification Cron Job Start (Time: ${new Date().toISOString()}) ---`,
  );
  const now = Date.now();
  const sortedSetKey = "reminders_by_time";

  try {
    // 1. Sorted Setから期限切れのリマインダーキーを取得
    const reminderKeys = await kv.zrange(sortedSetKey, 0, now, {
      byScore: true,
    });

    if (!reminderKeys || reminderKeys.length === 0) {
      console.log("[CRON] No pending reminders found in sorted set.");
      return response.status(200).json({ message: "No pending reminders." });
    }
    console.log(
      `[CRON] Found ${reminderKeys.length} potential reminders from sorted set.`,
    );

    // 2. リマインダーデータを一括取得
    const remindersData = await kv.mget(...reminderKeys);

    const pendingReminders = reminderKeys
      .map((key, index) => ({ key, data: remindersData[index] }))
      .filter((rem) => rem.data && rem.data.status === "pending");

    if (pendingReminders.length === 0) {
      console.log(
        "[CRON] No valid pending reminders after filtering. Cleaning up stale keys from sorted set.",
      );
      // データが取得できなかったキーは古いデータなのでSorted Setから削除
      if (reminderKeys.length > 0) {
        await kv.zrem(sortedSetKey, ...reminderKeys);
      }
      return response
        .status(200)
        .json({ message: "No valid pending reminders found." });
    }
    console.log(
      `[CRON] Found ${pendingReminders.length} reminders to process.`,
    );

    const allExpiredEndpoints = [];
    const updateTx = kv.multi();
    const deleteTx = kv.multi();

    // 3. リマインダーをユーザーIDでグループ化
    const remindersByUser = pendingReminders.reduce((acc, reminder) => {
      const userId = reminder.data.userId;
      if (!acc[userId]) acc[userId] = [];
      acc[userId].push(reminder);
      return acc;
    }, {});

    // 4. ユーザーごとに通知を送信
    for (const userId in remindersByUser) {
      const userReminders = remindersByUser[userId];
      const subscriptionKey = `user:${userId}:subscriptions`;
      const subscriptions = (await kv.get(subscriptionKey)) || [];

      console.log(
        `[CRON] User ${userId} has ${userReminders.length} reminders and ${subscriptions.length} subscriptions.`,
      );

      if (subscriptions.length === 0) {
        console.warn(
          `[CRON] No subscriptions for user ${userId}. Deleting ${userReminders.length} reminders.`,
        );
        const keysToDelete = userReminders.map((rem) => rem.key);
        deleteTx.del(...keysToDelete);
        deleteTx.zrem(sortedSetKey, ...keysToDelete);
        continue;
      }

      const payloadsToSend = userReminders.map((rem) => ({
        title: "おしらせベル",
        body: rem.data.message,
        url: rem.data.url,
        userId: userId, // Service Workerが使うためのユーザーID
      }));

      try {
        const result = await callSendWebPush(subscriptions, payloadsToSend);
        if (result.expiredEndpoints && result.expiredEndpoints.length > 0) {
          allExpiredEndpoints.push(
            ...result.expiredEndpoints.map((endpoint) => ({
              userId,
              endpoint,
            })),
          );
        }
      } catch (error) {
        console.error(
          `[CRON] Error sending notifications for user ${userId}:`,
          error,
        );
      }

      // 処理済みのリマインダーをKVとSorted Setから更新/再登録
      const nowForCalc = Date.now();

      for (const rem of userReminders) {
        if (!rem.data.schedule) {
          console.warn(
            `[CRON] Reminder ${rem.key} has no schedule property. Skipping.`,
          );
          continue;
        }

        const updatedReminderData = {
          ...rem.data,
          lastNotified: new Date(nowForCalc).toISOString(),
        };

        const baseForNextCalc = rem.data.baseDate
          ? new Date(rem.data.baseDate)
          : new Date(nowForCalc);

        let nextScheduleTime = calculateNextNotificationTime(
          rem.data.schedule,
          baseForNextCalc,
        );

        let i = 0; // 無限ループ防止
        while (nextScheduleTime.getTime() <= nowForCalc && i < 1000) {
          const nextBase = new Date(nextScheduleTime);
          nextBase.setMinutes(nextBase.getMinutes() + 1);
          nextScheduleTime = calculateNextNotificationTime(
            rem.data.schedule,
            nextBase,
          );
          i++;
        }

        updateTx.set(rem.key, updatedReminderData);
        updateTx.zrem(sortedSetKey, rem.key);
        updateTx.zadd(sortedSetKey, {
          score: nextScheduleTime.getTime(),
          member: rem.key,
        });
        console.log(
          `[CRON] Reminder ${rem.key} updated and re-scheduled for ${nextScheduleTime.toISOString()}`,
        );
      }
    }

    // トランザクションを実行
    await Promise.all([updateTx.exec(), deleteTx.exec()]);
    console.log("[CRON] Update and delete transactions executed.");

    // 5. 期限切れの購読情報をクリーンアップ
    if (allExpiredEndpoints.length > 0) {
      console.log(
        `[CRON] Cleaning up ${allExpiredEndpoints.length} expired endpoints.`,
      );
      const expiredByUserId = allExpiredEndpoints.reduce(
        (acc, { userId, endpoint }) => {
          if (!acc[userId]) acc[userId] = new Set();
          acc[userId].add(endpoint);
          return acc;
        },
        {},
      );

      for (const userId in expiredByUserId) {
        const subKey = `user:${userId}:subscriptions`;
        const currentSubs = (await kv.get(subKey)) || [];
        const endpointsToRemove = expiredByUserId[userId];
        const filteredSubs = currentSubs.filter(
          (s) => !endpointsToRemove.has(s.endpoint),
        );

        if (filteredSubs.length > 0) {
          await kv.set(subKey, filteredSubs);
        } else {
          await kv.del(subKey);
        }
        console.log(`[CRON] Cleaned up subscriptions for user ${userId}.`);
      }
    }

    console.log(`[CRON] --- Notification Cron Job End ---`);
    return response
      .status(200)
      .json({ message: "Notification task completed successfully." });
  } catch (error) {
    console.error("[CRON] Uncaught error in notification cron job:", error);
    return response
      .status(500)
      .json({ error: "Internal Server Error in cron job." });
  }
}
