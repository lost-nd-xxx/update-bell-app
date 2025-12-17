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

/**
 * userIdの形式を検証し、サニタイズします。
 * UUIDv4形式のみを許可します。
 * @param {string} userId 検証するユーザーID
 * @returns {string} 検証済みのユーザーID
 * @throws {Error} 不正な形式の場合
 */
export const validateAndSanitizeUserId = (userId) => {
  if (typeof userId !== "string") {
    throw new Error("Invalid userId: must be a string");
  }

  // UUIDv4形式を厳密にチェック
  const uuidV4Regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidV4Regex.test(userId)) {
    throw new Error("Invalid userId format: must be a valid UUIDv4");
  }

  return userId;
};

/**
 * reminderIdの形式を検証し、サニタイズします。
 * UUIDv4形式またはcuid形式を許可します。
 * @param {string} reminderId 検証するリマインダーID
 * @returns {string} 検証済みのリマインダーID
 * @throws {Error} 不正な形式の場合
 */
export const validateAndSanitizeReminderId = (reminderId) => {
  if (typeof reminderId !== "string") {
    throw new Error("Invalid reminderId: must be a string");
  }

  // UUIDv4形式をチェック
  const uuidV4Regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // cuid形式をチェック（小文字英数字、15〜30文字程度）
  // cuidは通常25文字だが、バージョンや実装により異なる場合があるため範囲を広げる
  const cuidRegex = /^[a-z0-9]{15,30}$/;

  if (!uuidV4Regex.test(reminderId) && !cuidRegex.test(reminderId)) {
    throw new Error(
      "Invalid reminderId format: must be a valid UUIDv4 or cuid",
    );
  }

  return reminderId;
};
