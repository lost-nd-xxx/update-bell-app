// update-bell-app/api/delete-reminder.js
import { kv } from "@vercel/kv";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  try {
    const { reminderId, userId } = request.body;

    if (!reminderId || !userId) {
      console.error("[ERROR] delete-reminder: Missing reminderId or userId.");
      return response
        .status(400)
        .json({ error: "Missing reminderId or userId." });
    }

    const reminderKey = `reminder:${userId}:${reminderId}`;
    const sortedSetKey = "reminders_by_time";
    const userReminderKeysKey = `user:${userId}:reminder_keys`;

    // トランザクションを開始
    const tx = kv.multi();

    // 1. リマインダー本体を削除
    tx.del(reminderKey);

    // 2. Sorted Setからスケジュールを削除
    tx.zrem(sortedSetKey, reminderKey);

    // 3. ユーザーのリマインダーキーセットからキーを削除
    tx.srem(userReminderKeysKey, reminderKey);

    // トランザクションを実行
    await tx.exec();

    console.log(
      `[INFO] delete-reminder: Reminder ${reminderKey} and its schedule deleted from KV.`,
    );

    return response
      .status(200)
      .json({ message: "Reminder deleted successfully." });
  } catch (error) {
    console.error("[ERROR] delete-reminder: Uncaught error:", error);
    return response
      .status(500)
      .json({ error: `Error deleting reminder: ${error.message}` });
  }
}
