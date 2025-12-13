// api/delete-subscription.js
import { kv } from "@vercel/kv";
import { checkRateLimit } from "./utils/ratelimit.js";
import { verifySignature } from "./utils/auth.js";

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
    const { userId, endpoint } = request.body; // endpointも送信されることを期待

    if (!userId || !endpoint) {
      console.error(
        "[ERROR] delete-subscription: Missing userId or subscription endpoint.",
      );
      return response
        .status(400)
        .json({ error: "Missing userId or subscription endpoint." });
    }

    const key = `user:${userId}:subscriptions`;
    let subscriptions = (await kv.get(key)) || [];

    // 指定されたエンドポイントの購読情報を削除
    const initialLength = subscriptions.length;
    subscriptions = subscriptions.filter((sub) => sub.endpoint !== endpoint);

    if (subscriptions.length < initialLength) {
      await kv.set(key, subscriptions);
      console.log(
        `[INFO] delete-subscription: Subscription for user ${userId} with endpoint ${endpoint} deleted from KV.`,
      );
      return response
        .status(200)
        .json({ message: "Subscription deleted successfully." });
    } else {
      // 該当する購読情報が見つからなかった場合
      console.log(
        `[INFO] delete-subscription: No matching subscription found for user ${userId} with endpoint ${endpoint}.`,
      );
      return response
        .status(200)
        .json({ message: "No matching subscription found." });
    }
  } catch (error) {
    console.error("[ERROR] delete-subscription: Uncaught error:", error);
    return response
      .status(500)
      .json({ error: `Error deleting subscription: ${error.message}` });
  }
}
