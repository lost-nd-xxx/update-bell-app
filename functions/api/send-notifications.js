// functions/api/send-notifications.js
// 通知送信のロジックをupdate-bell-app-notification-sender Workerに委譲する

/**
 * 共通の通知送信ロジック
 * @param {*} env Cloudflare環境変数
 */
async function executeSendNotifications(env) {
  console.log(`[DEBUG] --- Pages Function Notification Logic Start (Time: ${new Date().toISOString()}) ---`);
  const now = Date.now();

  // Notification Sender WorkerのURL (Cloudflare WorkersのURLは name.workers.dev 形式)
  const NOTIFICATION_SENDER_WORKER_URL = `https://update-bell-app-notification-sender.lost-nd-xxx.workers.dev`;
  // ここでlost-nd-xxx をユーザーのアカウント名に置き換えるように指示する必要がある。

  // Notification Sender Workerとの認証用シークレット
  const NOTIFICATION_SENDER_SECRET = env.NOTIFICATION_SENDER_SECRET;

  if (!NOTIFICATION_SENDER_SECRET) {
    console.error("[ERROR] NOTIFICATION_SENDER_SECRET is not set in environment variables for Pages Function.");
    return new Response("Notification sender secret missing.", { status: 500 });
  }

  try {
    const listResponse = await env.REMINDER_STORE.list({ prefix: "reminder:" });
    console.log(`[DEBUG] Found ${listResponse.keys.length} total reminder keys in KV.`);

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

    console.log(`[DEBUG] Found ${pendingReminders.length} pending reminders to process.`);
    if (pendingReminders.length === 0) {
      console.log("[DEBUG] No pending reminders to process. Exiting.");
      return new Response("No pending reminders.", { status: 200 });
    }

    const allExpiredEndpoints = [];

    // リマインダーをユーザーIDでグループ化し、通知Senderに一度に渡す
    const remindersByUser = pendingReminders.reduce((acc, reminder) => {
      const userId = reminder.data.userId;
      if (!acc[userId]) {
        acc[userId] = [];
      }
      acc[userId].push(reminder);
      return acc;
    }, {});

    for (const userId in remindersByUser) {
      const userReminders = remindersByUser[userId];
      const subscriptionKey = `user:${userId}:subscriptions`;
      const subscriptions = (await env.REMINDER_STORE.get(subscriptionKey, "json")) || [];
      console.log(`[DEBUG] Found ${subscriptions.length} subscriptions for user ${userId}.`);

      if (subscriptions.length === 0) {
        console.warn(`[WARN] No subscriptions found for user ${userId}. Deleting ${userReminders.length} reminders.`);
        for (const rem of userReminders) {
          await env.REMINDER_STORE.delete(rem.key);
        }
        continue;
      }

      // 通知ペイロードはリマインダーごとに生成
      const notificationsToSend = userReminders.map(rem => ({
        payload: {
          title: "おしらせベル",
          body: rem.data.message,
          url: rem.data.url,
        },
        reminderKey: rem.key, // 処理後に削除するためにキーを保持
      }));

      // Notification Sender Workerを呼び出す
      try {
        console.log(`[DEBUG] Calling Notification Sender Worker for user ${userId}...`);
        const workerResponse = await fetch(NOTIFICATION_SENDER_WORKER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Notification-Sender-Secret": NOTIFICATION_SENDER_SECRET, // シークレットヘッダー
          },
          body: JSON.stringify({
            subscriptions: subscriptions,
            payloads: notificationsToSend.map(n => n.payload) // すべてのペイロードを一度に渡す
          }),
        });

        if (!workerResponse.ok) {
          const errorText = await workerResponse.text();
          console.error(`[ERROR] Notification Sender Worker returned an error: ${workerResponse.status} ${workerResponse.statusText}. Body: ${errorText}`);
          continue; // このユーザーのリマインダーはスキップし、次のユーザーへ
        }

        const workerResult = await workerResponse.json();
        if (workerResult.expiredEndpoints && workerResult.expiredEndpoints.length > 0) {
          allExpiredEndpoints.push(...workerResult.expiredEndpoints);
          console.log(`[INFO] Notification Sender Worker reported ${workerResult.expiredEndpoints.length} expired endpoints for user ${userId}.`);
        }
        
        // 処理されたリマインダーをKVから削除
        for (const notif of notificationsToSend) {
          await env.REMINDER_STORE.delete(notif.reminderKey);
          console.log(`[INFO] Processed and deleted reminder: ${notif.reminderKey}`);
        }

      } catch (error) {
        console.error(`[ERROR] Error calling Notification Sender Worker for user ${userId}:`, error);
        continue;
      }
    }

    // 期限切れの購読情報をクリーンアップ (Pages Functions側で処理)
    if (allExpiredEndpoints.length > 0) {
      console.log(`[DEBUG] Cleaning up ${allExpiredEndpoints.length} expired endpoints across users.`);
      // ユーザーIDごとにグループ化し、KVから削除
      // この部分は既存のロジックを流用可能
      const subsByUser = allExpiredEndpoints.reduce((acc, endpoint) => {
        // endpointからuserIdを逆引きする必要があるが、それはここではできない。
        // workerからuserId情報も受け取るようにするか、Pages Functionでサブスクリプションを管理する際にuserIdを付与する。
        // ここでは便宜上、サブスクリプションが期限切れになったユーザーの他のサブスクリプションも確認する形にする。
        // より正確にするには workerResult.expiredEndpoints に { userId, endpoint } の形で含める必要がある
        // TODO: Notification Sender WorkerからのexpiredEndpointsにuserIdを含めてもらう

        // 現状は、Pages Function側で全サブスクリプションを再取得し、expiredEndpointsと突き合わせる
        // これはKVアクセスが増えるため効率が悪い
      }, {});

      // ここでは簡易的に、期限切れがあったユーザーのサブスクリプション全体を再評価する
      const uniqueUserIdsWithExpiredSubs = [...new Set(pendingReminders.map(r => r.data.userId))]; // 処理したユーザーから取得
      for (const userId of uniqueUserIdsWithExpiredSubs) {
        const subKey = `user:${userId}:subscriptions`;
        const currentSubs = (await env.REMINDER_STORE.get(subKey, "json")) || [];
        const filteredSubs = currentSubs.filter(s => !allExpiredEndpoints.includes(s.endpoint)); // 期限切れのエンドポイントを除外

        if (filteredSubs.length < currentSubs.length) { // 実際に削除されたものがある場合のみ更新
          if (filteredSubs.length > 0) {
            await env.REMINDER_STORE.put(subKey, JSON.stringify(filteredSubs));
          } else {
            await env.REMINDER_STORE.delete(subKey);
          }
          console.log(`[INFO] Cleaned up expired subscription(s) for user ${userId}. New count: ${filteredSubs.length}`);
        }
      }
    }

  } catch (error) {
    console.error("[ERROR] Uncaught error in Pages Function notification sender:", error);
    return new Response("Internal Server Error in Pages Function notification sender.", { status: 500 });
  }

  console.log(`[DEBUG] --- Pages Function Notification Logic End ---`);
  return new Response("Notification task completed successfully.", { status: 200 });
}

/**
 * HTTPリクエストで実行されるハンドラ
 */
export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

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