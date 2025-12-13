// update-bell-app/api/delete-all-user-reminders.js
import { kv } from "@vercel/kv";
import { checkRateLimit } from "./_utils/ratelimit.js";
import { verifySignature } from "./_utils/auth.js";

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

    console.log(`[API] Starting to delete all data for userId: ${userId}`);

    const userReminderKeysKey = `user:${userId}:reminder_keys`;
    const reminderKeys = await kv.smembers(userReminderKeysKey);

    if (reminderKeys.length === 0) {
      console.log(
        `[API] No reminder keys found for user ${userId}. Deleting subscription if it exists.`,
      );
      // サブスクリプションだけでも削除を試みる
      const subscriptionKey = `user:${userId}:subscriptions`;
      await kv.del(subscriptionKey);

      return response
        .status(200)
        .json({ message: "No reminders to delete, subscription cleaned up." });
    }

    const multi = kv.multi();

    // reminders_by_time sorted set からリマインダーを削除
    multi.zrem("reminders_by_time", ...reminderKeys);

    // 各リマインダーのハッシュデータを削除
    multi.del(...reminderKeys);

    // ユーザーのリマインダーキーセット自体を削除
    multi.del(userReminderKeysKey);

    // ユーザーのサブスクリプション情報も削除
    const subscriptionKey = `user:${userId}:subscriptions`;
    multi.del(subscriptionKey);

    await multi.exec();

    console.log(
      `[API] Successfully deleted ${reminderKeys.length} reminders and subscription for userId: ${userId}`,
    );

    return response.status(200).json({
      message: `Successfully deleted all data for user ${userId}`,
    });
  } catch (error) {
    console.error("[API] Error deleting user data:", error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}
