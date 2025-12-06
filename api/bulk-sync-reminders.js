// update-bell-app/api/bulk-sync-reminders.js
import { kv } from "@vercel/kv";
import { calculateNextNotificationTime } from "../utils/notification-helpers.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method Not Allowed" });
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

  try {
    const multi = kv.multi();
    const sortedSetKey = "reminders_by_time";
    const userReminderKeysKey = `user:${userId}:reminder_keys`;

    const reminderKeys = [];

    for (const reminder of reminders) {
      if (!reminder.id) continue;

      const reminderKey = `reminder:${userId}:${reminder.id}`;
      reminderKeys.push(reminderKey);

      const reminderToStore = {
        ...reminder,
        userId,
        status: "pending",
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
