// update-bell-app/api/schedule-reminder.js
import { kv } from "@vercel/kv";

// --- 型ガード関数 (ここから) ---
const isScheduleType = (type) => {
  return (
    typeof type === "string" &&
    ["daily", "weekly", "monthly", "interval", "specific_days"].includes(type)
  );
};

const isDateFilterType = (type) => {
  return (
    typeof type === "string" && ["all", "weekdays", "weekends"].includes(type)
  );
};

const isSchedule = (obj) => {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj;

  return (
    isScheduleType(o.type) &&
    typeof o.interval === "number" &&
    typeof o.hour === "number" &&
    typeof o.minute === "number" &&
    (o.dateFilter === undefined || isDateFilterType(o.dateFilter)) &&
    (o.selectedDays === undefined ||
      (Array.isArray(o.selectedDays) &&
        o.selectedDays.every((day) => typeof day === "number"))) &&
    (o.dayOfWeek === undefined || typeof o.dayOfWeek === "number") &&
    (o.weekOfMonth === undefined || typeof o.weekOfMonth === "number")
  );
};
// --- 型ガード関数 (ここまで) ---

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  try {
    const { reminder, userId } = request.body;

    // バリデーション
    if (
      !reminder ||
      !userId ||
      !reminder.reminderId ||
      !reminder.scheduledTime ||
      !reminder.schedule || // scheduleの存在チェック
      !isSchedule(reminder.schedule) // scheduleの構造チェック
    ) {
      console.error(
        "[ERROR] schedule-reminder: Invalid or missing data.",
        request.body,
      );
      return response.status(400).json({
        error: "Invalid or missing data provided.",
      });
    }

    const reminderKey = `reminder:${userId}:${reminder.reminderId}`;
    const userSubscriptionKey = `user:${userId}:subscriptions`;
    const sortedSetKey = "reminders_by_time"; // Sorted Setのキー名

    // statusは常にpendingとして保存
    const reminderToStore = {
      ...reminder,
      status: "pending",
    };

    // Vercel KVのトランザクションを開始
    const tx = kv.multi();

    // 1. リマインダー本体をKVに保存
    tx.set(reminderKey, reminderToStore);
    console.log(
      `[INFO] schedule-reminder: Queued saving reminder ${reminderKey} to KV.`,
    );

    // 2. スケジュール時刻をスコアとしてSorted Setに追加
    tx.zadd(sortedSetKey, {
      score: reminder.scheduledTime,
      member: reminderKey,
    });
    console.log(
      `[INFO] schedule-reminder: Queued adding reminder ${reminderKey} to sorted set with score ${reminder.scheduledTime}.`,
    );

    // ユーザーのサブスクリプションを更新
    if (reminder.subscription) {
      // getはトランザクション外で行う必要がある
      let subscriptions = (await kv.get(userSubscriptionKey)) || [];

      const existingSubscriptionIndex = subscriptions.findIndex(
        (sub) => sub.endpoint === reminder.subscription.endpoint,
      );

      if (existingSubscriptionIndex > -1) {
        subscriptions[existingSubscriptionIndex] = reminder.subscription;
        console.log(
          `[INFO] schedule-reminder: Updating existing subscription for user ${userId}.`,
        );
      } else {
        subscriptions.push(reminder.subscription);
        console.log(
          `[INFO] schedule-reminder: Adding new subscription for user ${userId}.`,
        );
      }

      // 3. サブスクリプションの更新もトランザクションに含める
      tx.set(userSubscriptionKey, subscriptions);
      console.log(
        `[INFO] schedule-reminder: Queued updating user subscriptions for ${userId} in KV.`,
      );
    }

    // トランザクションを実行
    await tx.exec();
    console.log(
      `[INFO] schedule-reminder: Transaction executed successfully for ${reminderKey}.`,
    );

    return response
      .status(200)
      .json({ message: "Reminder scheduled successfully." });
  } catch (error) {
    console.error("[ERROR] schedule-reminder: Uncaught error:", error);
    return response
      .status(500)
      .json({ error: `Error scheduling reminder: ${error.message}` });
  }
}
