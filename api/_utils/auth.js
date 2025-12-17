// api/utils/auth.js
import { Redis } from "@upstash/redis";
import crypto from "crypto";
import { getKvKey } from "./kv-utils.js";

const kv = Redis.fromEnv();

/**
 * リクエストの署名を検証します。
 *
 * @param {Request} request - Vercel Serverless Functionのリクエストオブジェクト
 * @param {object|string} requestBody - リクエストボディ（パース済みオブジェクトまたは文字列）
 * @returns {Promise<{success: boolean, status?: number, error?: string}>}
 */
export async function verifySignature(request, requestBody) {
  // ヘッダー取得 (Vercel/Node.jsではヘッダー名は小文字になる)
  const userId = request.headers["x-user-id"];
  const publicKeyStr = request.headers["x-public-key"];
  const signatureBase64 = request.headers["x-signature"];
  const timestamp = request.headers["x-timestamp"];

  // 必須情報の欠落チェック
  // 移行期間中であっても、クライアントが対応済みであれば必須とする方針
  if (!userId || !publicKeyStr || !signatureBase64 || !timestamp) {
    return {
      success: false,
      status: 401, // 400だとBad Requestだが、認証情報不足は401が適切
      error: "Missing authentication headers",
    };
  }

  // ボディに含まれるuserIdとヘッダーのuserIdの一致確認（なりすまし防止の二重チェック）
  let bodyUserId;
  try {
    bodyUserId =
      typeof requestBody === "string"
        ? JSON.parse(requestBody).userId
        : requestBody.userId;
  } catch (error) {
    return {
      success: false,
      status: 400,
      error: "Invalid JSON in request body",
    };
  }

  // userIdの型検証
  if (bodyUserId !== undefined && typeof bodyUserId !== "string") {
    return {
      success: false,
      status: 400,
      error: "userId must be a string",
    };
  }

  if (bodyUserId && bodyUserId !== userId) {
    return {
      success: false,
      status: 403,
      error: "User ID mismatch between header and body",
    };
  }

  // --- リプレイ攻撃対策 (タイムスタンプ検証) ---
  const requestTime = new Date(timestamp).getTime();
  const now = Date.now();
  const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

  if (isNaN(requestTime)) {
    return {
      success: false,
      status: 400,
      error: "Invalid timestamp format",
    };
  }

  // 未来のリクエスト（クロックズレ許容）または古すぎるリクエストを拒否
  if (Math.abs(now - requestTime) > FIVE_MINUTES_IN_MS) {
    return {
      success: false,
      status: 401,
      error: "Request timestamp expired or invalid",
    };
  }

  try {
    // メッセージの再構成
    // クライアント側と同じロジック: `${timestamp}.${JSON.stringify(body)}`
    // 注意: JSON.stringifyの揺らぎ（スペースやキー順序）により検証失敗するリスクがあるため
    // 本来的には正規化が必要だが、ここでは簡易実装とする。
    const bodyString =
      typeof requestBody === "string"
        ? requestBody
        : JSON.stringify(requestBody);
    const message = `${timestamp}.${bodyString}`;

    // KVからユーザーの公開鍵を取得
    const userPublicKeyKey = getKvKey(`user:${userId}:public_key`);
    let storedPublicKey = await kv.get(userPublicKeyKey);

    // 公開鍵のJSONパースを安全に実行
    let providedPublicKey;
    try {
      providedPublicKey = JSON.parse(publicKeyStr);

      // 公開鍵の基本構造を検証
      if (
        !providedPublicKey ||
        typeof providedPublicKey !== "object" ||
        !providedPublicKey.kty ||
        !providedPublicKey.crv
      ) {
        throw new Error("Invalid public key structure");
      }
    } catch (error) {
      return {
        success: false,
        status: 400,
        error: "Invalid public key format",
      };
    }

    if (!storedPublicKey) {
      // TOFU (Trust On First Use): 初回アクセス時に公開鍵を保存
      // 公開鍵の詳細な検証を実施
      try {
        // EC鍵の場合の検証
        if (providedPublicKey.kty === "EC") {
          // P-256/P-384/P-521のみ許可
          const allowedCurves = ["P-256", "P-384", "P-521"];
          if (!allowedCurves.includes(providedPublicKey.crv)) {
            return {
              success: false,
              status: 400,
              error: "Unsupported EC curve",
            };
          }

          // x, y座標が存在することを確認
          if (!providedPublicKey.x || !providedPublicKey.y) {
            return {
              success: false,
              status: 400,
              error: "Invalid EC public key: missing coordinates",
            };
          }
        }
        // RSA鍵の場合の検証
        else if (providedPublicKey.kty === "RSA") {
          // n, eが存在することを確認
          if (!providedPublicKey.n || !providedPublicKey.e) {
            return {
              success: false,
              status: 400,
              error: "Invalid RSA public key: missing modulus or exponent",
            };
          }
        } else {
          return {
            success: false,
            status: 400,
            error: "Unsupported key type",
          };
        }

        // crypto.createPublicKeyで実際にキーを作成してみる（検証）
        crypto.createPublicKey({
          key: providedPublicKey,
          format: "jwk",
        });
      } catch (error) {
        return {
          success: false,
          status: 400,
          error: "Invalid public key: unable to parse",
        };
      }

      await kv.set(userPublicKeyKey, providedPublicKey);
      storedPublicKey = providedPublicKey;
    } else {
      // 既存キーがある場合、送られてきたキーと一致するか確認（オプション）
      // ここでは、サーバー上のキー（正）を使って検証を行うため、
      // クライアントが勝手にキーを変えて送ってきても検証に失敗するだけとなる。
    }

    // Node.js cryptoでJWKを読み込む
    // Web Crypto APIのJWKとNode.jsの互換性を確保
    const keyObject = crypto.createPublicKey({
      key: storedPublicKey,
      format: "jwk",
    });

    // Base64url -> Buffer
    const base64Signature = signatureBase64
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const signatureBuffer = Buffer.from(base64Signature, "base64");

    // crypto.verifyはデフォルトでDER形式の署名を期待するが、
    // クライアント(Web Crypto API)はIEEE P1363形式の署名を生成する。
    // そのため、dsaEncoding: 'ieee-p1363' を指定して検証する必要がある。
    const verifier = crypto.createVerify("sha256");
    verifier.update(message);
    const isVerified = verifier.verify(
      {
        key: keyObject,
        dsaEncoding: "ieee-p1363", // 重要: Web Crypto互換
      },
      signatureBuffer,
    );

    if (isVerified) {
      return { success: true };
    } else {
      console.warn(`[AUTH] Signature verification failed for user ${userId}`);
      return { success: false, status: 401, error: "Invalid signature" };
    }
  } catch (error) {
    console.error("[AUTH] Verification error:", error);
    return {
      success: false,
      status: 500,
      error: "Internal Authentication Error",
    };
  }
}
