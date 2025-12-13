// update-bell-app/api/bulk-sync-reminders.js
import { kv } from "@vercel/kv";
import { calculateNextNotificationTime } from "./utils/notification-helpers.js";
import { checkRateLimit } from "./utils/ratelimit.js";
import { verifySignature } from "./utils/auth.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  // --- レートリミットチェック ---
  const { success, limit, remaining, reset } = await checkRateLimit(request);
  if (!success) {
    response.setHeader("RateLimit-Limit", limit);
    response.setHeader("RateLimit-Remaining", remaining);
    response.setHeader("RateLimit-Reset", new Date(reset).toISOString());
    return response.status(429).json({ error: "Too Many Requests" });
  }

  // --- 署名検証 (認証) ---
  const authResult = await verifySignature(request, request.body);
  if (!authResult.success) {
    return response
      .status(authResult.status || 401)
      .json({ error: authResult.error });
  }

  const { userId, reminders } = request.body;

  if (!userId || !Array.isArray(reminders)) {
    return response
      .status(400)
      .json({ error: "userId and a reminders array are required" });
  }

  if (reminders.length === 0) {
    return response.status(200).json({ message: "No reminders to sync." });
  }

  // --- 制限値の定義 ---
  const TITLE_MAX_LENGTH = 200;
  const URL_MAX_LENGTH = 2000;
  const TAG_MAX_LENGTH = 50;

  // --- バリデーション ---
  for (const reminder of reminders) {
    if (
      !reminder ||
      typeof reminder.id !== "string" ||
      typeof reminder.title !== "string" ||
      reminder.title.length > TITLE_MAX_LENGTH ||
      typeof reminder.url !== "string" ||
      reminder.url.length > URL_MAX_LENGTH ||
      (reminder.tags && !Array.isArray(reminder.tags)) || // tagsが存在する場合のみ配列かチェック
      (reminder.tags || []).some(
        (tag) => typeof tag !== "string" || tag.length > TAG_MAX_LENGTH,
      ) ||
      !reminder.schedule
    ) {
      console.error(
        "[ERROR] bulk-sync-reminders: Invalid, missing, or too long data in one of the reminders.",
        reminder,
      );
      return response.status(400).json({
        error:
          "Invalid, missing, or too long data provided in one of the reminders.",
      });
    }
  }

  try {
    const userReminderKeysKey = `user:${userId}:reminder_keys`;

    // --- 個数上限チェック ---
    const TOTAL_REMINDERS_MAX = 1000;
    const currentCount = await kv.scard(userReminderKeysKey);

    // まず、簡易的にチェック
    if (currentCount + reminders.length > TOTAL_REMINDERS_MAX) {
      // 上限を超える可能性がある場合のみ、より詳細なチェックを行う
      const existingIds = await kv.smembers(userReminderKeysKey);
      const newRemindersCount = reminders.filter(
        (r) => !existingIds.includes(`reminder:${userId}:${r.id}`),
      ).length;

      if (currentCount + newRemindersCount > TOTAL_REMINDERS_MAX) {
        return response.status(400).json({
          error: `インポートによりリマインダーの最大数 (${TOTAL_REMINDERS_MAX}件) を超えます。`,
        });
      }
    }

    const multi = kv.multi();
    const sortedSetKey = "reminders_by_time";
    const reminderKeys = [];

    for (const reminder of reminders) {
      const reminderKey = `reminder:${userId}:${reminder.id}`;
      reminderKeys.push(reminderKey);

      const reminderToStore = {
        ...reminder,
        userId,
        status: "pending",
        retryCount: 0,
      };

      // 1. リマインダー本体を保存
      multi.set(reminderKey, reminderToStore);

      // 2. 次の通知時刻を計算してSorted Setに追加
      const nextNotificationTime = calculateNextNotificationTime(
        reminder.schedule,
      );
      if (nextNotificationTime) {
        multi.zadd(sortedSetKey, {
          score: nextNotificationTime.getTime(),
          member: reminderKey,
        });
      }
    }

    if (reminderKeys.length > 0) {
      // 3. ユーザーのリマインダーキーセットを更新
      multi.sadd(userReminderKeysKey, ...reminderKeys);
    }

    await multi.exec();

    console.log(
      `[API] Successfully synced ${reminders.length} reminders for userId: ${userId}`,
    );

    return response.status(200).json({
      message: `Successfully synced ${reminders.length} reminders.`,
    });
  } catch (error) {
    console.error(
      `[API] Error in bulk-sync-reminders for userId: ${userId}`,
      error,
    );
    return response.status(500).json({ error: "Internal Server Error" });
  }
}
