import webpush from "web-push";

export default {
  async fetch(request, env, ctx) {
    return new Response(
      "This endpoint is primarily for scheduled notifications. Access via HTTP is not recommended.",
      { status: 405 },
    );
  },

  async scheduled(event, env, ctx) {
    console.log("Cron trigger fired for sending notifications.");
    const now = Date.now();

    const vapidKeys = {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    };

    if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
      console.error(
        "VAPID keys (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) are not set in environment variables.",
      );
      return new Response("VAPID keys missing.", { status: 500 });
    }

    webpush.setVapidDetails(
      "mailto:your-email@example.com", // TODO: お問い合わせ先などに変更
      vapidKeys.publicKey,
      vapidKeys.privateKey,
    );

    try {
      const listResponse = await env.REMINDER_STORE.list({
        prefix: "reminder:",
      });
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

      const notificationPromises = pendingReminders.map(async (reminder) => {
        const { userId, message, url } = reminder.data;
        const subscriptionKey = `user:${userId}:subscriptions`;
        const subscriptions =
          (await env.REMINDER_STORE.get(subscriptionKey, "json")) || [];

        if (subscriptions.length === 0) {
          console.warn(`No subscriptions found for user ${userId}. Deleting reminder.`);
          await env.REMINDER_STORE.delete(reminder.key);
          return;
        }

        const payload = JSON.stringify({
          title: "おしらせベル",
          body: message,
          url: url,
        });

        const promises = subscriptions.map((sub) => {
          return webpush.sendNotification(sub, payload).catch((error) => {
            if (error.statusCode === 410) {
              // 購読切れ(Gone)
              console.log(`Subscription for ${userId} has expired. Deleting.`);
              return { expired: true, userId, endpoint: sub.endpoint };
            } else {
              console.error(
                `Failed to send notification to ${userId}:`,
                error.body || error.message,
              );
              return { error: true, message: error.body || error.message };
            }
          });
        });

        // 正常に処理された（エラーにならなかった）リマインダーを削除
        await Promise.allSettled(promises);
        await env.REMINDER_STORE.delete(reminder.key);
        console.log(`Processed and deleted reminder: ${reminder.key}`);

        return promises;
      });

      const allResults = await Promise.allSettled(notificationPromises.flat());

      // 期限切れの購読情報をクリーンアップ
      const subscriptionsToRemove = allResults
        .filter(
          (p) =>
            p.status === "fulfilled" && p.value && p.value.expired === true,
        )
        .map((p) => p.value);

      if (subscriptionsToRemove.length > 0) {
        // ユーザーIDごとにグループ化
        const subsByUser = subscriptionsToRemove.reduce((acc, sub) => {
          if (!acc[sub.userId]) {
            acc[sub.userId] = [];
          }
          acc[sub.userId].push(sub.endpoint);
          return acc;
        }, {});

        for (const userId in subsByUser) {
          const subKey = `user:${userId}:subscriptions`;
          const currentSubs =
            (await env.REMINDER_STORE.get(subKey, "json")) || [];
          const endpointsToRemove = new Set(subsByUser[userId]);
          const filteredSubs = currentSubs.filter(
            (s) => !endpointsToRemove.has(s.endpoint),
          );

          if (filteredSubs.length > 0) {
            await env.REMINDER_STORE.put(subKey, JSON.stringify(filteredSubs));
          } else {
            // 全ての購読が切れた場合はキーごと削除
            await env.REMINDER_STORE.delete(subKey);
          }
          console.log(
            `Cleaned up ${endpointsToRemove.size} expired subscription(s) for user ${userId}.`,
          );
        }
      }
    } catch (error) {
      console.error("Error in scheduled notification sender:", error);
    }

    return new Response("Scheduled task completed.", { status: 200 });
  },
};