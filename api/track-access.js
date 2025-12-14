// update-bell-app/api/track-access.js
import { kv } from "@vercel/kv";
import { verifySignature } from "./_utils/auth.js";
import { checkRateLimit } from "./_utils/ratelimit.js";

const getKvKey = (key) => `${process.env.KV_PREFIX || ""}${key}`;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  // --- 1. Rate Limit ---
  // (Optional but good practice for public-facing write endpoints)
  const { success } = await checkRateLimit(request);
  if (!success) {
    return response.status(429).json({ error: "Too Many Requests" });
  }

  // --- 2. Authentication ---
  const authResult = await verifySignature(request, request.body);
  if (!authResult.success) {
    return response
      .status(authResult.status || 401)
      .json({ error: authResult.error });
  }

  try {
    const { userId } = request.body;
    // verifySignature ensures consistency, but double check exists
    if (!userId) {
      // クライアントには詳細を返さず、サーバーログに記録
      console.warn("[WARN] track-access: Missing userId in request body.");
      return response
        .status(400)
        .json({ error: "Bad Request: userId is required." });
    }

    const lastAccessKey = getKvKey(`user_last_access:${userId}`);
    const now = Date.now();

    // ユーザーの最終アクセス日時を更新
    await kv.set(lastAccessKey, now);

    console.log(
      `[INFO] track-access: Updated last access time for user ${userId} to ${now}.`,
    );

    return response
      .status(200)
      .json({ message: "Access tracked successfully." });
  } catch (error) {
    console.error("[ERROR] track-access: Uncaught error:", error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}
