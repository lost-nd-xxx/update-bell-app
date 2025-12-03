// update-bell-app/api/send-web-push.js
import webpush from "web-push";

const VAPID_SUBJECT = "mailto:shimayoshiba@gmail.com";

// --- ここから環境変数チェック ---
// 必須の環境変数のリスト
const requiredEnvVars = ["VITE_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"];

const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName],
);

if (missingEnvVars.length > 0) {
  // サーバー起動時に一度だけコンソールにエラーを記録する
  console.error(
    `[FATAL] Missing required environment variables: ${missingEnvVars.join(", ")}`,
  );
}
// --- ここまで環境変数チェック ---

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  // --- リクエストごとの環境変数チェック ---
  if (missingEnvVars.length > 0) {
    console.error(
      `[ERROR] Server configuration error: Missing environment variables: ${missingEnvVars.join(", ")}`,
    );
    return response.status(500).json({
      error: `Server configuration error: Missing environment variables.`,
    });
  }

  try {
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      process.env.VITE_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  } catch (error) {
    console.error(
      "[ERROR] Failed to set VAPID details. Check VAPID key format.",
      error,
    );
    return response.status(500).json({
      error: "VAPID key configuration error. Check if key values are correct.",
      details: error.message,
    });
  }
  // --- ここまで ---

  const { subscriptions, payloads } = request.body;

  if (
    !subscriptions ||
    !Array.isArray(subscriptions) ||
    !payloads ||
    !Array.isArray(payloads) ||
    payloads.length === 0
  ) {
    console.error(
      "[ERROR] Missing or invalid subscriptions or payloads in request body.",
    );
    return response
      .status(400)
      .json({ error: "Missing or invalid subscriptions or payloads." });
  }

  console.log(
    `[NotificationSender] Preparing to send ${payloads.length} payloads to ${subscriptions.length} subscriptions...`,
  );

  const notificationPromises = [];
  for (const payload of payloads) {
    for (const sub of subscriptions) {
      const promise = webpush
        .sendNotification(sub, JSON.stringify(payload), { TTL: 60 })
        .then((pushResponse) => {
          console.log(
            `[NotificationSender] Notification sent successfully to ${sub.endpoint.substring(0, 50)}... Status: ${pushResponse.statusCode}`,
          );
          return { status: "fulfilled", endpoint: sub.endpoint };
        })
        .catch((error) => {
          // 410 Gone はサブスクリプション期限切れなので、エラーではなく期限切れとして扱う
          if (error.statusCode === 410) {
            console.log(
              `[INFO] Subscription expired and will be removed: ${sub.endpoint.substring(0, 50)}...`,
            );
            return { status: "expired", endpoint: sub.endpoint };
          }
          console.error(
            `[ERROR] Failed to send notification to ${sub.endpoint.substring(0, 50)}... Status: ${error.statusCode}. Body: ${error.body || "No response body"}`,
          );
          return {
            status: "rejected",
            endpoint: sub.endpoint,
            reason: error.body,
          };
        });
      notificationPromises.push(promise);
    }
  }

  const results = await Promise.all(notificationPromises);

  const expiredEndpoints = results
    .filter((result) => result.status === "expired")
    .map((result) => result.endpoint);

  const failedCount = results.filter(
    (result) => result.status === "rejected",
  ).length;

  if (failedCount > 0) {
    console.warn(`[WARN] ${failedCount} notifications failed to send.`);
  }

  return response.status(200).json({
    message: "Notifications processed.",
    expiredEndpoints: expiredEndpoints,
    failedCount: failedCount,
  });
}
