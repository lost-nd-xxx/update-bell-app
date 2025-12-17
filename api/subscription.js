import { Redis } from "@upstash/redis";
import { checkRateLimit } from "./_utils/ratelimit.js";
import { verifySignature } from "./_utils/auth.js";
import { getKvKey, validateAndSanitizeUserId } from "./_utils/kv-utils.js";

const kv = Redis.fromEnv();

/**
 * エンドポイントURLを正規化します
 * @param {string} url - 正規化するURL
 * @returns {string} 正規化されたURL
 */
function normalizeEndpoint(url) {
  try {
    const parsed = new URL(url);
    // プロトコル、ホスト名（小文字化）、パス名を正規化
    // クエリパラメータとハッシュは除外（通常、プッシュエンドポイントには含まれないが念のため）
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname}`;
  } catch (error) {
    // URLパースに失敗した場合は元の文字列をそのまま返す
    return url;
  }
}

export default async function handler(request, response) {
  // 1. Rate Limiting
  const { success } = await checkRateLimit(request);
  if (!success) {
    return response.status(429).json({ error: "Too Many Requests" });
  }

  // 2. Authentication (Signature Verification)
  // GET以外のリクエストは署名検証を行う
  // DELETEメソッドでもボディが必要になるため、クライアント側でボディを含めるように実装する必要がある
  const authResult = await verifySignature(request, request.body);
  if (!authResult.success) {
    return response
      .status(authResult.status || 401)
      .json({ error: authResult.error });
  }

  const { userId, subscription } = request.body;
  if (!userId) {
    return response.status(400).json({ error: "userId is required" });
  }

  // Validate and sanitize userId to prevent NoSQL injection
  let sanitizedUserId;
  try {
    sanitizedUserId = validateAndSanitizeUserId(userId);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }

  const subscriptionKey = getKvKey(`user:${sanitizedUserId}:subscriptions`);

  try {
    if (request.method === "POST") {
      // --- Save Subscription ---
      if (!subscription || !subscription.endpoint) {
        return response
          .status(400)
          .json({ error: "Valid subscription object required" });
      }

      // 既存のサブスクリプションリストを取得
      const existing = (await kv.get(subscriptionKey)) || [];

      // 重複チェック (endpointで判定、URL正規化して比較)
      const normalizedEndpoint = normalizeEndpoint(subscription.endpoint);
      const exists = existing.some(
        (sub) => normalizeEndpoint(sub.endpoint) === normalizedEndpoint,
      );
      if (!exists) {
        existing.push(subscription);
        await kv.set(subscriptionKey, existing);
        console.log(
          `[INFO] subscription: New subscription saved for user ${sanitizedUserId}. Total: ${existing.length}`,
        );
      } else {
        console.log(
          `[INFO] subscription: Subscription already exists for user ${sanitizedUserId}.`,
        );
      }

      return response.status(201).json({ message: "Subscription saved" });
    } else if (request.method === "DELETE") {
      // --- Delete Subscription ---
      // 削除対象の特定には endpoint が必要
      const endpointToDelete = subscription?.endpoint;

      if (!endpointToDelete) {
        // endpointが指定されていない場合は、そのユーザーの全サブスクリプションを削除するか、エラーにするか。
        // 安全のため、特定のエンドポイント削除を基本とするが、
        // クライアントの実装に合わせて「指定がなければ全削除」または「エラー」にする。
        // ここでは、特定のデバイスからの解除を想定してエラーを返すか、
        // クライアントが「全解除」を意図している場合は別のフラグが必要。
        // 現状の delete-subscription.js のロジックを確認すると、
        // `subscription` オブジェクトを受け取って、その endpoint を削除している。
        return response
          .status(400)
          .json({ error: "Subscription endpoint is required for deletion" });
      }

      const existing = (await kv.get(subscriptionKey)) || [];
      // URL正規化して比較
      const normalizedEndpointToDelete = normalizeEndpoint(endpointToDelete);
      const newSubscriptions = existing.filter(
        (sub) => normalizeEndpoint(sub.endpoint) !== normalizedEndpointToDelete,
      );

      if (newSubscriptions.length !== existing.length) {
        if (newSubscriptions.length === 0) {
          await kv.del(subscriptionKey);
        } else {
          await kv.set(subscriptionKey, newSubscriptions);
        }
        console.log(
          `[INFO] subscription: Subscription deleted for user ${sanitizedUserId}. Remaining: ${newSubscriptions.length}`,
        );
      } else {
        console.log(
          `[INFO] subscription: Subscription not found for user ${sanitizedUserId} to delete.`,
        );
      }

      return response.status(200).json({ message: "Subscription deleted" });
    } else {
      return response.status(405).json({ error: "Method Not Allowed" });
    }
  } catch (error) {
    console.error(`[ERROR] subscription handler error:`, error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}
