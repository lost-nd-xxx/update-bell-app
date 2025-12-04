// update-bell-app/api/track-access.js
import { kv } from "@vercel/kv";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  try {
    const { userId } = request.body;

    if (!userId) {
      // クライアントには詳細を返さず、サーバーログに記録
      console.warn("[WARN] track-access: Missing userId in request body.");
      return response
        .status(400)
        .json({ error: "Bad Request: userId is required." });
    }

    const lastAccessKey = `user_last_access:${userId}`;
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
