import webpush from "web-push";

/**
 * 共通の通知送信ロジック
 * @param {*} env Cloudflare環境変数
 */
async function executeSendNotifications(env) {
  console.log("Executing notification sending logic...");
  const now = Date.now();

  const vapidKeys = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.error("VAPID keys are not set in environment variables.");
    return new Response("VAPID keys missing.", { status: 500 });
  }

  webpush.setVapidDetails(
    "mailto:shimayoshiba@gmail.com",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  try {
    const listResponse = await env.REMINDER_STORE.list({ prefix: "reminder:" });
    const pendingReminders = [];

    for (const key of listResponse.keys) {
      const reminderData = await env.REMINDER_STORE.get(key.name, "json");
      if (
        reminderData &&
        reminderData.status === "pending" &&
        reminderData.scheduledTime <= now
      ) {
        pendingReminders.push({ key: key.name, data: reminderData });
      }
    }

    console.log(`Found ${pendingReminders.length} pending reminders to process.`);
    if (pendingReminders.length === 0) {
      return new Response("No pending reminders.", { status: 200 });
    }

    const notificationPromises = pendingReminders.map(async (reminder) => {
      const { userId, message, url } = reminder.data;
      const subscriptionKey = `user:${userId}:subscriptions`;
      const subscriptions = (await env.REMINDER_STORE.get(subscriptionKey, "json")) || [];

      if (subscriptions.length === 0) {
        console.warn(`No subscriptions found for user ${userId}. Deleting reminder.`);
        await env.REMINDER_STORE.delete(reminder.key);
        return [];
      }

      const payload = JSON.stringify({
        title: "おしらせベル",
        body: message,
        url: url,
      });

      const promises = subscriptions.map((sub) =>
        webpush.sendNotification(sub, payload).catch((error) => {
          if (error.statusCode === 410) {
            console.log(`Subscription for ${userId} has expired. Deleting.`);
            return { expired: true, userId, endpoint: sub.endpoint };
          }
          console.error(`Failed to send notification to ${userId}:`, error.body || error.message);
          return { error: true, message: error.body || error.message };
        })
      );

      // 正常に処理された（エラーにならなかった）リマインダーを削除
      await Promise.allSettled(promises);
      await env.REMINDER_STORE.delete(reminder.key);
      console.log(`Processed and deleted reminder: ${reminder.key}`);

      return promises;
    });

    const allResults = await Promise.allSettled(notificationPromises.flat());
    const subscriptionsToRemove = allResults
      .filter((p) => p.status === "fulfilled" && p.value?.expired)
      .map((p) => p.value);

    if (subscriptionsToRemove.length > 0) {
      const subsByUser = subscriptionsToRemove.reduce((acc, sub) => {
        acc[sub.userId] = acc[sub.userId] || [];
        acc[sub.userId].push(sub.endpoint);
        return acc;
      }, {});

      for (const userId in subsByUser) {
        const subKey = `user:${userId}:subscriptions`;
        const currentSubs = (await env.REMINDER_STORE.get(subKey, "json")) || [];
        const endpointsToRemove = new Set(subsByUser[userId]);
        const filteredSubs = currentSubs.filter((s) => !endpointsToRemove.has(s.endpoint));
        
        if (filteredSubs.length > 0) {
          await env.REMINDER_STORE.put(subKey, JSON.stringify(filteredSubs));
        } else {
          await env.REMINDER_STORE.delete(subKey);
        }
        console.log(`Cleaned up ${endpointsToRemove.size} expired subscription(s) for user ${userId}.`);
      }
    }
  } catch (error) {
    console.error("Error in notification sender:", error);
    return new Response("Internal Server Error in notification sender.", { status: 500 });
  }

  return new Response("Notification task completed successfully.", { status: 200 });
}

/**
 * HTTPリクエスト（POST）で実行されるハンドラ
 */
export async function onRequestPost({ request, env }) {
  const secret = request.headers.get("X-Cron-Secret");
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  return executeSendNotifications(env);
}

/**
 * スケジュール（Cron）で実行されるハンドラ
 * （後方互換性または将来のwrangler.toml対応のため残す）
 */
export const scheduled = async (event, env, ctx) => {
  console.log("Cron trigger fired for sending notifications.");
  ctx.waitUntil(executeSendNotifications(env));
};
