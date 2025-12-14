// api/_utils/kv-utils.js
// KVキーに環境プレフィックスを付与・除去するためのユーティリティ

/**
 * KVキーに環境プレフィックスを付与します。
 * @param {string} key プレフィックスなしのキー名
 * @returns {string} プレフィックス付きのキー名
 */
export const getKvKey = (key) => `${process.env.KV_PREFIX || ""}${key}`;

/**
 * KVキーから環境プレフィックスを除去します。
 * 主にcronジョブなどで、キーからuser IDなどをパースする際に使用します。
 * @param {string} prefixedKey プレフィックス付きのキー名
 * @returns {string} プレフィックス除去後のキー名
 */
export const parseKvKey = (prefixedKey) => {
  const prefix = process.env.KV_PREFIX || "";
  if (prefix && prefixedKey.startsWith(prefix)) {
    return prefixedKey.substring(prefix.length);
  }
  return prefixedKey;
};
