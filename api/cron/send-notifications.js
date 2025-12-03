// update-bell-app/api/cron/send-notifications.js
import { kv } from "@vercel/kv";

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
        const deleteTx = kv.multi();
        const keysToDelete = userReminders.map((rem) => rem.key);
        deleteTx.del(...keysToDelete);
        deleteTx.zrem(sortedSetKey, ...keysToDelete);
        await deleteTx.exec();
        continue;
      }

      const payloadsToSend = userReminders.map((rem) => ({
        title: "おしらせベル",
        body: rem.data.message,
        url: rem.data.url,
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
                  const updateTx = kv.multi();
                  const now = Date.now();
                  
                  for (const rem of userReminders) {
                    const updatedReminderData = { ...rem.data, lastNotified: new Date(now).toISOString() };
                    
                    // 次回の通知時刻を計算
                    // calculateNextNotificationTime関数はhelpers.tsからimportする必要がありますが、
                    // ここでは簡易的にAPI内で定義します。実際は共通関数としてimportすべきです。
                    // TODO: helpers.tsからimportするように変更する
                    const calculateNextNotificationTime = (schedule, baseDate = new Date()) => {
                      const hour = schedule.hour;
                      const minute = schedule.minute;
                      let nextDate = new Date(baseDate);
                      
                      // ここはhelpers.tsのcalculateNextNotificationTimeロジックの簡略版
                      // 実際にはhelpers.tsの関数をそのまま使用すべき
                      nextDate.setHours(hour, minute, 0, 0);
                      if (nextDate.getTime() <= baseDate.getTime()) {
                        nextDate.setDate(nextDate.getDate() + 1); // 翌日に設定（最も単純な繰り返し）
                      }
                      return nextDate;
                    };
      
                    const nextScheduleTime = calculateNextNotificationTime(rem.data.schedule, new Date(now));
      
                    updateTx.set(rem.key, updatedReminderData); // lastNotifiedを更新して保存
                    updateTx.zrem(sortedSetKey, rem.key); // 古いSorted Setエントリを削除
                    updateTx.zadd(sortedSetKey, { score: nextScheduleTime.getTime(), member: rem.key }); // 新しい時刻で再追加
                    console.log(`[CRON] Reminder ${rem.key} updated and re-scheduled for ${nextScheduleTime.toISOString()}`);
                  }
                  await updateTx.exec();    }

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
