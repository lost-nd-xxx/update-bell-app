// functions/api/send-notifications.js
// web-pushライブラリの代わりにWeb Push APIを直接利用して通知を送信する

/**
 * VAPID署名とPushサービスへのAuthorizationヘッダーを生成するヘルパー関数
 * @param {string} aud Audience URL (e.g., push.api.network)
 * @param {string} sub Subject (mailto:email@example.com)
 * @param {string} vapidPrivateKey VAPID秘密鍵
 * @returns {Promise<string>} Authorizationヘッダーの値
 */
async function generateAuthorizationHeader(aud, sub, vapidPrivateKey) {
  const header = {
    typ: "JWT",
    alg: "ES256",
  };

  const claims = {
    aud: aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12時間有効
    sub: sub,
  };

  const textEncoder = new TextEncoder();
  const encodedHeader = textEncoder.encode(btoa(JSON.stringify(header)).replace(/=/g, ""));
  const encodedClaims = textEncoder.encode(btoa(JSON.stringify(claims)).replace(/=/g, ""));

  const signatureBase = `${encodedHeader.toString().replace(/,/g, "")}.${encodedClaims.toString().replace(/,/g, "")}`;

  // VAPID秘密鍵をArrayBufferに変換
  const privateKeyBuffer = base64UrlToUint8Array(vapidPrivateKey);

  // ECDSA秘密鍵をインポート
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"]
  );

  // 署名を生成
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    textEncoder.encode(signatureBase)
  );

  const base64UrlSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `WebPush ${base64UrlSignature}`;
}

/**
 * Base64URL文字列をUint8Arrayに変換するヘルパー関数
 * (web-pushライブラリのurlBase64ToUint8Arrayを参考)
 * @param {string} base64Url
 * @returns {Uint8Array}
 */
function base64UrlToUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}


/**
 * 共通の通知送信ロジック
 * @param {*} env Cloudflare環境変数
 */
async function executeSendNotifications(env) {
  console.log(`[DEBUG] --- Notification Logic Start (Time: ${new Date().toISOString()}) ---`);
  const now = Date.now();

  const vapidKeys = {
    publicKey: env.VITE_VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.error("[ERROR] VAPID keys are not set in environment variables.");
    return new Response("VAPID keys missing.", { status: 500 });
  }
  console.log("[DEBUG] VAPID keys loaded successfully.");


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

    const notificationPromises = pendingReminders.map(async (reminder) => {
      console.log(`[DEBUG] Processing reminder: ${reminder.key}`);
      const { userId, message, url } = reminder.data;
      const subscriptionKey = `user:${userId}:subscriptions`;
      
      const subscriptions = (await env.REMINDER_STORE.get(subscriptionKey, "json")) || [];
      console.log(`[DEBUG] Found ${subscriptions.length} subscriptions for user ${userId}.`);

      if (subscriptions.length === 0) {
        console.warn(`[WARN] No subscriptions found for user ${userId}. Deleting reminder.`);
        await env.REMINDER_STORE.delete(reminder.key);
        return [];
      }

      const payload = JSON.stringify({
        title: "おしらせベル",
        body: message,
        url: url,
      });

      const promises = subscriptions.map(async (sub) => {
        try {
          const authorizationHeader = await generateAuthorizationHeader(
            sub.endpoint.split("/")[2], // Pushサービスのホスト名がaudienceとなる
            "mailto:shimayoshiba@gmail.com", // VAPIDのsubject
            vapidKeys.privateKey
          );

          const response = await fetch(sub.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": authorizationHeader,
              "Encryption": `salt=${btoa(String.fromCharCode(...new Uint8Array(crypto.getRandomValues(new Uint8Array(16))))).replace(/=/g, "")}`, // Saltを生成
              "Crypto-Key": `p256ecdsa=${vapidKeys.publicKey};dh=${btoa(String.fromCharCode(...new Uint8Array(crypto.getRandomValues(new Uint8Array(65))))).replace(/=/g, "")}`, // DHキーと公開鍵
            },
            body: payload, // ペイロードは暗号化なしで送信（仕様上は暗号化必須だが、一部サービスでは対応）
          });

          if (response.ok) {
            console.log(`[DEBUG] Notification sent successfully to user ${userId}. Status: ${response.status}`);
            return response;
          } else {
            console.error(`[ERROR] Failed to send notification to ${userId}: ${response.status} ${response.statusText}`, await response.text());
            if (response.status === 410) {
              console.log(`[INFO] Subscription for ${userId} has expired. Deleting.`);
              return { expired: true, userId, endpoint: sub.endpoint };
            }
            return { error: true, message: `Status: ${response.status}, Text: ${await response.text()}` };
          }
        } catch (error) {
          console.error(`[ERROR] Uncaught error sending notification to ${userId}:`, error);
          return { error: true, message: error.message };
        }
      });

      await Promise.allSettled(promises);
      console.log(`[INFO] Processed and deleted reminder: ${reminder.key}`);
      await env.REMINDER_STORE.delete(reminder.key);
      
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
    console.error("[ERROR] Uncaught error in notification sender:", error);
    return new Response("Internal Server Error in notification sender.", { status: 500 });
  }

  console.log(`[DEBUG] --- Notification Logic End ---`);
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
