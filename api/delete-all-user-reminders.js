// update-bell-app/api/delete-all-user-reminders.js
import { Redis } from "@upstash/redis";
import { checkRateLimit } from "./_utils/ratelimit.js";
import { verifySignature } from "./_utils/auth.js";
import { getKvKey, validateAndSanitizeUserId } from "./_utils/kv-utils.js";

const kv = Redis.fromEnv();

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
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

  try {
    const { userId } = request.body;

    if (!userId) {
      return response.status(400).json({ error: "userId is required" });
    }

    // Validate and sanitize userId to prevent NoSQL injection
    let sanitizedUserId;
    try {
      sanitizedUserId = validateAndSanitizeUserId(userId);
    } catch (error) {
      return response.status(400).json({ error: error.message });
    }

    console.log(
      `[API] Starting to delete all data for userId: ${sanitizedUserId}`,
    );

    const userReminderKeysKey = getKvKey(
      `user:${sanitizedUserId}:reminder_keys`,
    );
    const reminderKeys = await kv.smembers(userReminderKeysKey);

    if (reminderKeys.length === 0) {
      console.log(
        `[API] No reminder keys found for user ${sanitizedUserId}. Deleting subscription if it exists.`,
      );
      // サブスクリプションだけでも削除を試みる
      const subscriptionKey = getKvKey(`user:${sanitizedUserId}:subscriptions`);
      await kv.del(subscriptionKey);

      return response
        .status(200)
        .json({ message: "No reminders to delete, subscription cleaned up." });
    }

    const multi = kv.multi();

    // reminders_by_time sorted set からリマインダーを削除
    multi.zrem(getKvKey("reminders_by_time"), ...reminderKeys);

    // 各リマインダーのハッシュデータを削除
    multi.del(...reminderKeys);

    // ユーザーのリマインダーキーセット自体を削除
    multi.del(userReminderKeysKey);

    // ユーザーのサブスクリプション情報も削除
    const subscriptionKey = getKvKey(`user:${sanitizedUserId}:subscriptions`);
    multi.del(subscriptionKey);

    await multi.exec();

    console.log(
      `[API] Successfully deleted ${reminderKeys.length} reminders and subscription for userId: ${sanitizedUserId}`,
    );

    return response.status(200).json({
      message: `Successfully deleted all data for user ${sanitizedUserId}`,
    });
  } catch (error) {
    console.error("[API] Error deleting user data:", error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}
