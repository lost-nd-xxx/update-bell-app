// api/utils/ratelimit.js
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let ratelimit;
let kv;

try {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    kv = Redis.fromEnv();
    const cache = new Map();
    ratelimit = new Ratelimit({
      redis: kv,
      limiter: Ratelimit.slidingWindow(10, "10 s"), // 10秒あたり10リクエスト
      ephemeralCache: cache,
      analytics: false, // analyticsを無効化してイベントログの蓄積を防ぐ
      prefix: "@upstash/ratelimit",
    });
  }
} catch (e) {
  console.warn("Failed to initialize Redis for ratelimit:", e);
}

if (!ratelimit) {
  // KVが利用できない場合（ローカル開発など）のためのフォールバック
  console.warn("Upstash Redis is not available. Rate limiting is disabled.");
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
    (request.headers["x-forwarded-for"] || "").split(",")[0] || "127.0.0.1";
  const { success, pending, limit, remaining, reset } = await ratelimit.limit(
    `ratelimit_${clientIp}`,
  );
  await pending;

  return { success, limit, remaining, reset };
}
