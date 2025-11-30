// functions/api/send-notifications.js

// Cloudflare WorkersでWeb Pushを送信する関数 (web-pushライブラリの代替)
// この実装は複雑なため、スケルトンとして提供し、別途実装またはライブラリの導入が必要です。
// 実際のWeb Pushプロトコル実装は非常に複雑です。
// 参考:
// - https://developers.cloudflare.com/workers/runtime-apis/web-standards/crypto/
// - https://developers.cloudflare.com/workers/tutorials/web-push-notifications/
async function sendWebPushNotification(subscription, payload, vapidKeys) {
  console.warn("sendWebPushNotification: Actual Web Push logic not yet implemented for Workers.");

  try {
    // 実際は、VAPID署名生成、ペイロード暗号化、HTTP POSTリクエストをここで行う
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', // 実際は暗号化ペイロードのContent-Type
        'Authorization': `WebPush ${vapidKeys.publicKey}`, // VAPID署名を含むヘッダー
      },
      body: payload, // 実際は暗号化されたペイロード
    });

    if (!response.ok) {
      console.error(`Failed to send push notification: ${response.status} ${response.statusText}`);
      if (response.status === 410) { // 購読切れ
        return { success: false, expired: true };
      }
      return { success: false, expired: false };
    }
    return { success: true, expired: false };
  } catch (error) {
    console.error("Error during push notification fetch:", error);
    return { success: false, expired: false };
  }
}

export default {
  async fetch(request, env, ctx) {
    return new Response("This endpoint is primarily for scheduled notifications. Access via HTTP is not recommended.", { status: 405 });
  },

  async scheduled(event, env, ctx) {
    console.log("Cron trigger fired for sending notifications.");
    const now = Date.now();

    const vapidKeys = {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    };

    if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
      console.error("VAPID keys (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) are not set in environment variables.");
      return new Response("VAPID keys missing.", { status: 500 });
    }

    try {
      const listResponse = await env.REMINDER_STORE.list({ prefix: "reminder:" });
      const pendingReminders = [];

      for (const key of listResponse.keys) {
        const reminderData = await env.REMINDER_STORE.get(key.name, "json");
        if (reminderData && reminderData.status === 'pending' && reminderData.scheduledTime <= now) {
          pendingReminders.push({ key: key.name, data: reminderData });
        }
      }

      console.log(`Found ${pendingReminders.length} pending reminders to process.`);

      const notificationPromises = pendingReminders.flatMap(async (reminder) => {
        const { userId, message, url } = reminder.data;
        const subscriptionKey = `user:${userId}:subscriptions`;
        const subscriptions = await env.REMINDER_STORE.get(subscriptionKey, "json");

        if (!subscriptions || subscriptions.length === 0) {
          console.warn(`No subscriptions found for user ${userId}. Deleting reminder.`);
          await env.REMINDER_STORE.delete(reminder.key);
          return [];
        }

        const payload = JSON.stringify({
          title: "Update Bell Reminder",
          body: message,
          url: url,
        });

        return subscriptions.map(async (sub) => {
          return sendWebPushNotification(sub, payload, vapidKeys).then(result => ({
            ...result,
            subscription: sub,
            userId: userId,
            reminderKey: reminder.key
          }));
        });
      });

      const allResults = await Promise.allSettled(notificationPromises.flat());

      const subscriptionsToRemove = new Set();
      const processedReminderKeys = new Set();

      for (const result of allResults) {
        if (result.status === 'fulfilled' && result.value) {
          const { success, expired, subscription, userId, reminderKey } = result.value;
          
          if (expired) {
            subscriptionsToRemove.add(JSON.stringify({ userId, endpoint: subscription.endpoint }));
          }

          if (success || expired) {
            processedReminderKeys.add(reminderKey);
          }
        } else if (result.status === 'rejected') {
          console.error("Notification promise rejected:", result.reason);
        }
      }

      for (const item of subscriptionsToRemove) {
        const { userId, endpoint } = JSON.parse(item);
        const subKey = `user:${userId}:subscriptions`;
        const currentSubs = await env.REMINDER_STORE.get(subKey, "json");
        if (currentSubs) {
          const filteredSubs = currentSubs.filter(s => s.endpoint !== endpoint);
          if (filteredSubs.length > 0) {
            await env.REMINDER_STORE.put(subKey, JSON.stringify(filteredSubs));
          } else {
            await env.REMINDER_STORE.delete(subKey);
          }
        }
      }

      for (const key of processedReminderKeys) {
        await env.REMINDER_STORE.delete(key);
        console.log(`Processed and deleted reminder: ${key}`);
      }

    } catch (error) {
      console.error("Error in scheduled notification sender:", error);
    }
    
    return new Response("Scheduled task completed.", { status: 200 }); 
  },
};