// update-bell-app/api/save-subscription.js
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
    const { userId, subscription } = request.body;

    if (!userId || !subscription) {
      return response
        .status(400)
        .json({ error: "Missing userId or subscription" });
    }

    const key = `user:${userId}:subscriptions`;
    const subscriptions = (await kv.get(key)) || [];

    // 既に登録されているSubscriptionかチェック
    const isAlreadySubscribed = subscriptions.some(
      (sub) => sub.endpoint === subscription.endpoint,
    );

    if (!isAlreadySubscribed) {
      subscriptions.push(subscription);
      await kv.set(key, subscriptions);
    }

    return response
      .status(200)
      .json({ message: "Subscription saved successfully" });
  } catch (error) {
    console.error("Error saving subscription:", error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}
