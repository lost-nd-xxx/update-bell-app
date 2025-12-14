// update-bell-app/api/cron/send-notifications.js
import { kv } from "@vercel/kv";
import { calculateNextNotificationTime } from "../_utils/notification-helpers.js";
import { isReminder } from "../_utils/type-guards.js";
import { webPush } from "../_utils/web-push.js";
import { getKvKey, parseKvKey } from "../_utils/kv-utils.js"; // KVユーティリティをインポート

const RETRY_LIMIT = 3; // リトライ回数の上限

/**
 * Vercel Cron から呼び出されるハンドラ
 */
export default async function handler(request, response) {
  if (
    process.env.CRON_SECRET &&
    request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  console.log(
    `[CRON] --- Notification Cron Job Start (Time: ${new Date().toISOString()}) ---`,
  );
  const now = Date.Now();
  const sortedSetKey = getKvKey("reminders_by_time");

  try {
    // 1. Sorted Setから期限切れのリマインダーキーを取得
    const reminderKeys = await kv.zrange(sortedSetKey, 0, now, {
      byScore: true,
    });

    if (!reminderKeys || reminderKeys.length === 0) {
      console.log("[CRON] No pending reminders found in sorted set.");
      return response.status(200).json({ message: "No pending reminders." });
    }

    // 2. リマインダー本体とサブスクリプション情報を取得
    // KVから取得したキーはプレフィックス付きなので、パースしてuserIdを抽出
    const userIds = [
      ...new Set(reminderKeys.map((key) => parseKvKey(key).split(":")[1])),
    ];
    const subKeys = userIds.map((id) => getKvKey(`user:${id}:subscriptions`));
    const subsData = subKeys.length > 0 ? await kv.mget(...subKeys) : [];

    const subscriptions = userIds.reduce((acc, userId, index) => {
      acc[userId] = subsData[index] || [];
      return acc;
    }, {});

    // 3. 処理対象リマインダーをフィルタリング＆整形
    const remindersToProcess = reminderKeys
      .map((key, index) => {
        const data = remindersData[index];
        // parseKvKey でプレフィックスを除去してから split する
        const userId = parseKvKey(key).split(":")[1];
        if (!data || !isReminder(data) || !subscriptions[userId]) {
          return null;
        }
        // "pending" または "failed" 状態のリマインダーを対象とする
        if (data.status !== "pending" && data.status !== "failed") {
          return null;
        }
        // "failed" の場合はリトライ上限をチェック
        if (data.status === "failed" && (data.retryCount || 0) >= RETRY_LIMIT) {
          console.log(`[CRON] Reminder ${key} reached retry limit. Pausing.`);
          // 上限に達したものは一時停止状態に更新
          const pausedReminder = { ...data, isPaused: true };
          updateTx.set(key, pausedReminder); // updateTx を使う
          updateTx.zrem(sortedSetKey, key); // Sorted Setからも削除
          return null;
        }
        return { key, userId, data, subscriptions: subscriptions[userId] };
      })
      .filter(Boolean);

    if (remindersToProcess.length === 0) {
      console.log("[CRON] No reminders to process after filtering.");
      return response.status(200).json({ message: "No reminders to process." });
    }

    // 4. 通知送信とKVの更新
    const updateTx = kv.multi();

    for (const { key, userId, data, subscriptions } of remindersToProcess) {
      const payload = JSON.stringify({
        title: data.title,
        options: {
          body: `リマインダー: ${data.title}`,
          icon: "/icon-192x192.png",
          badge: "/icon-badge.png",
          data: { url: data.url },
        },
      });

      try {
        // 全てのサブスクリプションに通知を試みる
        const sendResults = await Promise.allSettled(
          subscriptions.map((sub) => webPush.sendNotification(sub, payload)),
        );

        const expiredSubs = sendResults.reduce((acc, result, index) => {
          if (
            result.status === "rejected" &&
            result.reason.statusCode === 410
          ) {
            acc.push(subscriptions[index].endpoint);
          }
          return acc;
        }, []);

        // 少なくとも1つの通知が成功（または失敗がリトライ可能）であれば成功とみなす
        const isSentAtLeastOnce = sendResults.some(
          (res) =>
            res.status === "fulfilled" ||
            (res.status === "rejected" && res.reason.statusCode !== 410),
        );

        if (!isSentAtLeastOnce && expiredSubs.length === subscriptions.length) {
          // 全てのサブスクリプションが無効
          throw new Error("All subscriptions are expired.");
        }

        // --- 成功時の処理 ---
        const nextScheduleTime = calculateNextNotificationTime(data.schedule);
        const updatedReminder = {
          ...data,
          lastNotified: new Date().toISOString(),
          status: "pending",
          retryCount: 0,
        };
        updateTx.set(key, updatedReminder);
        updateTx.zrem(sortedSetKey, key);
        if (nextScheduleTime) {
          updateTx.zadd(sortedSetKey, {
            score: nextScheduleTime.getTime(),
            member: key,
          });
        }

        // 無効なサブスクリプションがあれば削除
        if (expiredSubs.length > 0) {
          const newSubs = subscriptions.filter(
            (sub) => !expiredSubs.includes(sub.endpoint),
          );
          updateTx.set(getKvKey(`user:${userId}:subscriptions`), newSubs);
        }
      } catch (error) {
        // --- 失敗時の処理 ---
        const isRetryable = !error.message.includes(
          "All subscriptions are expired",
        );

        if (isRetryable) {
          const failedReminder = {
            ...data,
            status: "failed",
            retryCount: (data.retryCount || 0) + 1,
          };
          updateTx.set(key, failedReminder);
          console.log(
            `[CRON] Failed to send notification for ${key}. Will retry.`,
            error.message,
          );
        } else {
          const pausedReminder = { ...data, isPaused: true };
          updateTx.set(key, pausedReminder);
          updateTx.zrem(sortedSetKey, key);
          console.log(
            `[CRON] Unretryable error for ${key}. Pausing reminder.`,
            error.message,
          );
        }
      }
    }

    await updateTx.exec();
    console.log(`[CRON] --- Notification Cron Job End ---`);
    return response
      .status(200)
      .json({ message: "Notification task completed." });
  } catch (error) {
    console.error("[CRON] Uncaught error in notification cron job:", error);
    return response
      .status(500)
      .json({ error: "Internal Server Error in cron job." });
  }
}
