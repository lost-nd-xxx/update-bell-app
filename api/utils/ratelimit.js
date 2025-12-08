// api/utils/ratelimit.js
import { kv } from "@vercel/kv";
import { Ratelimit } from "@upstash/ratelimit";

let ratelimit;

if (kv) {
  const cache = new Map();
  ratelimit = new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(10, "10 s"), // 10秒あたり10リクエスト
    ephemeralCache: cache,
    analytics: true,
    prefix: "@upstash/ratelimit",
  });
} else {
  // KVが利用できない場合（ローカル開発など）のためのフォールバック
  console.warn("Vercel KV is not available. Rate limiting is disabled.");
  ratelimit = {
    limit: () => ({
      success: true,
      pending: Promise.resolve(),
      limit: 10,
      remaining: 10,
      reset: Date.now() + 10000,
    }),
  };
}

export async function checkRateLimit(request) {
  if (!kv) {
    return { success: true };
  }

  const clientIp =
    request.headers["x-forwarded-for"]?.split(",")[0] || "127.0.0.1";
  const { success, pending, limit, remaining, reset } = await ratelimit.limit(
    `ratelimit_${clientIp}`,
  );
  await pending;

  return { success, limit, remaining, reset };
}
