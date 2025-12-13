// src/utils/crypto.ts

// アルゴリズム設定: ECDSA, P-256, SHA-256
const ALGORITHM = {
  name: "ECDSA",
  namedCurve: "P-256",
};

const SIGN_ALGORITHM = {
  name: "ECDSA",
  hash: { name: "SHA-256" },
};

/**
 * 新しいキーペア（秘密鍵・公開鍵）を生成します。
 */
export const generateKeyPair = async (): Promise<CryptoKeyPair> => {
  return await window.crypto.subtle.generateKey(
    ALGORITHM,
    true, // extractable: 鍵をエクスポート可能にする
    ["sign", "verify"], // 使用目的
  );
};

/**
 * 秘密鍵または公開鍵をJWK形式（JSONオブジェクト）にエクスポートします。
 * LocalStorageへの保存に使用します。
 */
export const exportKey = async (key: CryptoKey): Promise<JsonWebKey> => {
  return await window.crypto.subtle.exportKey("jwk", key);
};

/**
 * JWK形式のキーからCryptoKeyオブジェクトをインポートします。
 */
export const importKey = async (
  jwk: JsonWebKey,
  type: "public" | "private",
): Promise<CryptoKey> => {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    ALGORITHM,
    true,
    type === "private" ? ["sign"] : ["verify"],
  );
};

/**
 * 文字列をArrayBufferに変換します（UTF-8エンコード）。
 */
const str2ab = (str: string): ArrayBuffer => {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer; // Uint8ArrayのbufferプロパティでArrayBufferを取得
};

/**
 * ArrayBufferをBase64url文字列に変換します。
 */
const ab2base64url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

/**
 * データ（文字列）に対して署名を生成し、Base64url文字列として返します。
 */
export const signData = async (
  privateKey: CryptoKey,
  data: string,
): Promise<string> => {
  const signature = await window.crypto.subtle.sign(
    SIGN_ALGORITHM,
    privateKey,
    str2ab(data),
  );
  return ab2base64url(signature);
};

/**
 * リクエストボディとタイムスタンプから署名対象のメッセージを作成します。
 * 形式: `${timestamp}.${bodyJSON}`
 */
export const createSignatureMessage = (
  body: string | object,
  timestamp: string,
): string => {
  const bodyString = typeof body === "string" ? body : JSON.stringify(body);
  return `${timestamp}.${bodyString}`;
};
