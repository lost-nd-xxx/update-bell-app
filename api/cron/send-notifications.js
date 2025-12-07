// update-bell-app/api/cron/send-notifications.js
import { kv } from "@vercel/kv";
import { calculateNextNotificationTime } from "../utils/notification-helpers.js";

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

/**
 * リマインダーデータが処理に必要な最小限の構造を満たしているかチェックする型ガード
 * @param {any} data チェック対象のデータ
 * @returns {boolean}
 */
function isReminder(data) {
  // messageプロパティもチェック対象に加える
  return (
    data &&
    typeof data.userId === "string" &&
    typeof data.message === "string" &&
    typeof data.schedule === "object" &&
    data.schedule !== null &&
    data.status === "pending" &&
    data.isPaused !== true
  );
}

/**
 * 通知購読情報が正しい形式かチェックする
 * @param {any} sub
 * @returns {boolean}
 */
function isSubscription(sub) {
  return (
    sub &&
    typeof sub.endpoint === "string" &&
    sub.keys &&
    typeof sub.keys.p256dh === "string" &&
    typeof sub.keys.auth === "string"
  );
}

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
      .filter((rem) => isReminder(rem.data));

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
      const subscriptionsData = (await kv.get(subscriptionKey)) || [];

      // 型ガードを適用
      const subscriptions = Array.isArray(subscriptionsData)
        ? subscriptionsData.filter(isSubscription)
        : [];

      console.log(
        `[CRON] User ${userId} has ${userReminders.length} reminders and ${subscriptions.length} valid subscriptions.`,
      );

      if (subscriptions.length === 0) {
        console.warn(
          `[CRON] No valid subscriptions for user ${userId}. Deleting ${userReminders.length} reminders.`,
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
    const transactions = [];
    if (updateTx.commands.length > 0) {
      transactions.push(updateTx.exec());
    }
    if (deleteTx.commands.length > 0) {
      transactions.push(deleteTx.exec());
    }

    if (transactions.length > 0) {
      await Promise.all(transactions);
      console.log("[CRON] Update and delete transactions executed.");
    }

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
