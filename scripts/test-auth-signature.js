// scripts/test-auth-signature.js
// 認証署名ロジックのテストスクリプト

// 目的:
// クライアント側 (Web Crypto API) で生成された署名が、
// サーバー側 (Node.jsのcryptoモジュール) で正しく検証されることを確認します。
// 特に、Web Crypto APIが生成するIEEE P1363形式の署名と、
// Node.jsのcrypto.verify/createVerifyとの互換性を検証します。
// リプレイ攻撃対策のタイムスタンプ検証もテスト範囲に含みます。

// 実行方法:
// node scripts/test-auth-signature.js

import crypto from "crypto";
const { subtle } = crypto.webcrypto; // Node.js 15+

// クライアントのcrypto.tsと同じアルゴリズム設定
const ALGORITHM = {
  name: "ECDSA",
  namedCurve: "P-256",
};

const SIGN_ALGORITHM = {
  name: "ECDSA",
  hash: {
    name: "SHA-256",
  },
};

// JWK形式のキーからCryptoKeyオブジェクトをインポートします。
// (Web Crypto API)
const importKeyWebCrypto = async (jwk, type) => {
  return await subtle.importKey(
    "jwk",
    jwk,
    ALGORITHM,
    true,
    type === "private" ? ["sign"] : ["verify"],
  );
};

// 文字列をArrayBufferに変換します（UTF-8エンコード）。
const str2ab = (str) => {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
};

// ArrayBufferをBase64url文字列に変換します。
const ab2base64url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Node.js環境なのでbtoaの代わりにBufferを使用
  return Buffer.from(binary, "binary").toString("base64url");
};

// データ（文字列）に対して署名を生成し、Base64url文字列として返します。
// (Web Crypto API)
const signDataWebCrypto = async (privateKey, data) => {
  const signature = await subtle.sign(SIGN_ALGORITHM, privateKey, str2ab(data));
  return ab2base64url(signature);
};

// リクエストボディとタイムスタンプから署名対象のメッセージを作成します。
// 形式: `${timestamp}.${bodyJSON}`
const createSignatureMessage = (body, timestamp) => {
  const bodyString = typeof body === "string" ? body : JSON.stringify(body);
  return `${timestamp}.${bodyString}`;
};

// `api/utils/auth.js` の `verifySignature` 関数を模倣した検証ロジック。
// (Node.js standard crypto moduleを使用 - サーバー側の実装)
async function verifySignatureMock(requestHeaders, requestBody) {
  const userId = requestHeaders["x-user-id"];
  const publicKeyStr = requestHeaders["x-public-key"];
  const signatureBase64 = requestHeaders["x-signature"];
  const timestamp = requestHeaders["x-timestamp"];
  if (!userId || !publicKeyStr || !signatureBase64 || !timestamp) {
    return {
      success: false,
      error: "Missing authentication headers",
    };
  }
  const bodyUserId =
    typeof requestBody === "string"
      ? JSON.parse(requestBody).userId
      : requestBody.userId;
  if (bodyUserId && bodyUserId !== userId) {
    return {
      success: false,
      error: "User ID mismatch",
    };
  }

  // --- リプレイ攻撃対策 (タイムスタンプ検証) ---
  const requestTime = new Date(timestamp).getTime();
  const now = Date.now();
  const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
  if (isNaN(requestTime) || Math.abs(now - requestTime) > FIVE_MINUTES_IN_MS) {
    return {
      success: false,
      error: "Request timestamp expired or invalid",
    };
  }
  try {
    const bodyString =
      typeof requestBody === "string"
        ? requestBody
        : JSON.stringify(requestBody);
    const message = `${timestamp}.${bodyString}`;
    const providedPublicKey = JSON.parse(publicKeyStr);
    // Node.js cryptoでJWKを読み込む
    const keyObject = crypto.createPublicKey({
      key: providedPublicKey,
      format: "jwk",
    });

    // Base64url -> Buffer
    // Node.jsのbase64urlデコードを使用
    const signatureBuffer = Buffer.from(signatureBase64, "base64url");

    // crypto.verifyは、ECDSA P-256の場合、デフォルトでDER形式の署名を期待するが、
    // Web Crypto APIはIEEE P1363 (Raw) 形式を出力する。
    // Node.js 12+ (特に新しいバージョン) では dsaEncoding オプションで指定可能。
    const verifier = crypto.createVerify("sha256");
    verifier.update(message);
    const isVerified = verifier.verify(
      {
        key: keyObject,
        dsaEncoding: "ieee-p1363",
      },
      signatureBuffer,
    );
    return {
      success: isVerified,
      error: isVerified ? undefined : "Invalid signature",
    };
  } catch (error) {
    console.error("Verification mock error:", error);
    return {
      success: false,
      error: "Internal Verification Error",
    };
  }
}

async function runTest() {
  console.log("--- Running Auth Signature Test (Web Crypto) ---");

  // 1. キーペア生成 (Web Crypto)
  const keyPair = await subtle.generateKey(ALGORITHM, true, ["sign", "verify"]);

  // 公開鍵をJWKエクスポート
  const publicKeyJwk = await subtle.exportKey("jwk", keyPair.publicKey);
  const testUserId = "test-user-123";
  const testBody = {
    userId: testUserId,
    data: "some-payload",
  };
  const testTimestamp = new Date().toISOString();

  // 2. 署名生成 (Web Crypto - クライアント側と同じ)
  const messageToSign = createSignatureMessage(testBody, testTimestamp);
  const signature = await signDataWebCrypto(keyPair.privateKey, messageToSign);

  // 3. 署名付きリクエストヘッダーの準備
  const requestHeaders = {
    "x-user-id": testUserId,
    "x-public-key": JSON.stringify(publicKeyJwk),
    "x-signature": signature,
    "x-timestamp": testTimestamp,
  };
  console.log("\n--- Test Case 1: Valid Signature ---");
  console.log("Signature (Base64url):", signature);

  // 検証前に、サーバー側実装の問題点を確認するために
  // crypto.verify のオプションをここで調整して試す必要がある。
  // もし標準の crypto.verify が失敗するなら、サーバー側コードも修正が必要。
  const result1 = await verifySignatureMock(requestHeaders, testBody);
  console.log(
    "Result 1 (Valid):",
    result1.success ? "PASSED" : "FAILED",
    result1.error || "",
  );
  if (!result1.success) {
    console.warn(
      "!! Test 1 Failed. This likely indicates an incompatibility between Web Crypto signature format (IEEE P1363) and Node.js verify expectation (DER).",
    );

    // 修正案の検証: dsaEncodingオプションを使った検証を試みる
    try {
      const bodyString = JSON.stringify(testBody);
      const message = `${testTimestamp}.${bodyString}`;
      const keyObject = crypto.createPublicKey({
        key: publicKeyJwk,
        format: "jwk",
      });
      const signatureBuffer = Buffer.from(signature, "base64url");

      // Node.js 13.2.0+ で dsaEncoding オプションがサポートされている
      // verifyOneShot (crypto.verify) ではオプション指定が難しい場合があるため
      // Verifyオブジェクトを使用する
      const verifier = crypto.createVerify("sha256");
      verifier.update(message);
      const isVerifiedIEEE = verifier.verify(
        {
          key: keyObject,
          dsaEncoding: "ieee-p1363", // これが重要
        },
        signatureBuffer,
      );
      console.log(
        "Retry with dsaEncoding: 'ieee-p1363' ->",
        isVerifiedIEEE ? "PASSED" : "FAILED",
      );
      if (isVerifiedIEEE) {
        console.log(
          "--> FIX REQUIRED: Server-side code (api/utils/auth.js) needs to use createVerify with dsaEncoding: 'ieee-p1363' instead of simple crypto.verify.",
        );
      }
    } catch (e) {
      console.error("Retry failed:", e);
    }
    // テスト続行のために強制終了しない
  }

  // --- Test Case 2: Invalid Signature (Tampered Body) ---
  console.log("\n--- Test Case 2: Invalid Signature (Tampered Body) ---");
  const tamperedBody = {
    userId: testUserId,
    data: "tampered-payload",
  };
  const result2 = await verifySignatureMock(requestHeaders, tamperedBody); // 署名とボディが不一致
  console.log(
    "Result 2 (Tampered Body):",
    result2.success ? "FAILED" : "PASSED",
    result2.error || "",
  );
  if (result2.success) {
    console.error("Test Case 2 Failed. Tampered body should be rejected.");
  }

  // --- Test Case 3: Invalid Signature (Tampered Timestamp) ---
  console.log("\n--- Test Case 3: Invalid Signature (Tampered Timestamp) ---");
  const tamperedTimestampHeaders = {
    ...requestHeaders,
    "x-timestamp": new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  }; // 10分前のタイムスタンプ

  // 注意: 署名自体は元のタイムスタンプとボディで作られているため、タイムスタンプを変えると署名検証で「Invalid signature」になるはず。
  // リプレイ攻撃対策（タイムスタンプ期限切れ）の前に署名検証で弾かれる可能性が高いが、いずれにせよ失敗すべき。
  // リプレイ攻撃対策そのものをテストするには、そのタイムスタンプで「正しい署名」を作って送る必要がある。
  // Test Case 3a: 古いタイムスタンプで正しい署名を作った場合（リプレイ攻撃対策のテスト）
  const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const messageOld = createSignatureMessage(testBody, oldTimestamp);
  const signatureOld = await signDataWebCrypto(keyPair.privateKey, messageOld);
  const oldRequestHeaders = {
    ...requestHeaders,
    "x-timestamp": oldTimestamp,
    "x-signature": signatureOld,
  };
  const result3 = await verifySignatureMock(oldRequestHeaders, testBody);
  console.log(
    "Result 3 (Expired Old Timestamp):",
    result3.success ? "FAILED" : "PASSED",
    result3.error || "",
  );
  if (result3.success) {
    console.error("Test Case 3 Failed. Expired timestamp should be rejected.");
  }

  // --- Test Case 4: Expired Timestamp (Future) ---
  console.log("\n--- Test Case 4: Expired Timestamp (Future) ---");
  const futureTimestamp = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10分後
  const messageFuture = createSignatureMessage(testBody, futureTimestamp);
  const signatureFuture = await signDataWebCrypto(
    keyPair.privateKey,
    messageFuture,
  );
  const futureRequestHeaders = {
    ...requestHeaders,
    "x-timestamp": futureTimestamp,
    "x-signature": signatureFuture,
  };
  const result4 = await verifySignatureMock(futureRequestHeaders, testBody);
  console.log(
    "Result 4 (Expired Future Timestamp):",
    result4.success ? "FAILED" : "PASSED",
    result4.error || "",
  );
  if (result4.success) {
    console.error("Test Case 4 Failed. Future timestamp should be rejected.");
  }

  // --- Test Case 5: Missing Headers ---
  console.log("\n--- Test Case 5: Missing Headers ---");
  const missingHeaders = {
    "x-user-id": testUserId,
  }; // 不足したヘッダー
  const result5 = await verifySignatureMock(missingHeaders, testBody);
  console.log(
    "Result 5 (Missing Headers):",
    result5.success ? "FAILED" : "PASSED",
    result5.error || "",
  );
  if (result5.success) {
    console.error("Test Case 5 Failed. Missing headers should be rejected.");
  }
  console.log("\n--- Auth Signature Test Completed ---");
}

runTest().catch(console.error);
