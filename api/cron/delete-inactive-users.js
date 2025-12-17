// update-bell-app/api/cron/delete-inactive-users.js
import { Redis } from "@upstash/redis";
import { getKvKey, parseKvKey } from "../_utils/kv-utils.js";
import crypto from "crypto";

const kv = Redis.fromEnv();

const SIX_MONTHS_IN_MS = 182.5 * 24 * 60 * 60 * 1000;
const CRON_LAST_ACCESS_SCAN_CURSOR_KEY = getKvKey(
  "cron_delete_inactive_users_last_access_scan_cursor",
);
const CRON_REMINDER_SCAN_CURSOR_KEY = getKvKey(
  "cron_delete_inactive_users_reminder_scan_cursor",
);
const TEMP_ALL_USER_IDS_KEY = getKvKey(
  "cron_delete_inactive_users_temp_all_user_ids",
);
const TEMP_USERS_WITH_ACCESS_RECORD_KEY = getKvKey(
  "cron_delete_inactive_users_temp_users_with_access_record",
);
const SCAN_COUNT = 100; // 一度にスキャンするキーの数

/**
 * KVをスキャンし、指定されたパターンにマッチするキーからuserIdを抽出し、
 * 一時的なKVセットに保存します。カーソルをKVに保存・読み込みします。
 *
 * @param {string} cursorKey - カーソルを保存するKVキー
 * @param {string} tempSetKey - 収集したuserIdを保存するKVセットキー
 * @param {string} matchPattern - スキャンするキーのパターン (例: "reminder:*")
 * @param {number} scanCount - 一度にスキャンするキーの数
 * @returns {Promise<{scanComplete: boolean, nextCursor: number}>}
 */
async function scanKeysAndStoreUserIds(
  cursorKey,
  tempSetKey,
  matchPattern,
  scanCount,
) {
  let cursor = await kv.get(cursorKey);
  // @upstash/redis の scan カーソルは文字列だが、初期値は 0 (数値または文字列) で扱える
  // ただし、レスポンスのカーソルは文字列 "0" で終了を示す
  cursor = cursor === null ? 0 : cursor;

  console.log(
    `[CRON-DELETE][SCAN] Starting scan for ${matchPattern} from cursor: ${cursor}`,
  );

  const [nextCursor, keys] = await kv.scan(cursor, {
    match: matchPattern,
    count: scanCount,
  });

  if (keys.length > 0) {
    const userIds = keys
      .map((key) => parseKvKey(key).split(":")[1])
      .filter(Boolean); // userIdを抽出
    if (userIds.length > 0) {
      await kv.sadd(tempSetKey, ...userIds); // 一時セットにuserIdを追加
    }
  }

  await kv.set(cursorKey, nextCursor); // 次回のためにカーソルを保存

  // @upstash/redis では nextCursor は文字列の "0" で終了
  const scanComplete = nextCursor === "0" || nextCursor === 0;
  console.log(
    `[CRON-DELETE][SCAN] Scanned ${keys.length} keys for ${matchPattern}. Next cursor: ${nextCursor}. Complete: ${scanComplete}`,
  );
  return { scanComplete, nextCursor };
}

export default async function handler(request, response) {
  // 定数時間比較でタイミング攻撃を防ぐ
  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.authorization || "";
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

    try {
      const authBuffer = Buffer.from(authHeader, "utf8");
      const expectedBuffer = Buffer.from(expectedAuth, "utf8");

      // 長さが異なる場合は比較できないので拒否
      if (authBuffer.length !== expectedBuffer.length) {
        console.warn("[CRON-DELETE] Unauthorized access attempt.");
        return response.status(401).json({ error: "Unauthorized" });
      }

      if (!crypto.timingSafeEqual(authBuffer, expectedBuffer)) {
        console.warn("[CRON-DELETE] Unauthorized access attempt.");
        return response.status(401).json({ error: "Unauthorized" });
      }
    } catch (error) {
      console.warn("[CRON-DELETE] Unauthorized access attempt.");
      return response.status(401).json({ error: "Unauthorized" });
    }
  }

  console.log(
    `[CRON-DELETE] --- Inactive User Deletion Job Start (Time: ${new Date().toISOString()}) ---`,
  );

  try {
    const now = Date.now();
    const inactiveUserIds = [];

    // 1. ユーザーの最終アクセス記録キーをスキャン (バッチ処理)
    let cursor = await kv.get(CRON_LAST_ACCESS_SCAN_CURSOR_KEY);
    cursor = cursor === null ? 0 : cursor;

    console.log(`[CRON-DELETE] Starting scan from cursor: ${cursor}`);

    const [nextCursor, lastAccessKeys] = await kv.scan(cursor, {
      match: getKvKey("user_last_access:*"),
      count: SCAN_COUNT,
    });

    // 次回のためにカーソルを保存
    await kv.set(CRON_LAST_ACCESS_SCAN_CURSOR_KEY, nextCursor);

    const isScanFinished = nextCursor === "0" || nextCursor === 0;

    if (lastAccessKeys.length === 0 && isScanFinished) {
      // スキャンが完全に終了し、新しいキーも見つからなかった場合
      await kv.del(CRON_LAST_ACCESS_SCAN_CURSOR_KEY); // カーソルをリセット
      console.log(
        "[CRON-DELETE] No user access records found and scan complete.",
      );
      return response
        .status(200)
        .json({ message: "No user access records found and scan complete." });
    } else if (lastAccessKeys.length === 0 && !isScanFinished) {
      // 今回のスキャンではキーが見つからなかったが、まだスキャンが残っている場合
      console.log(
        "[CRON-DELETE] No user access records found in this batch. Continuing scan next time.",
      );
      return response.status(200).json({
        message:
          "No user access records found in this batch. Scan not yet complete.",
        nextCursor: nextCursor,
      });
    }

    console.log(
      `[CRON-DELETE] Found ${lastAccessKeys.length} user access records in this batch to check. Next cursor: ${nextCursor}`,
    );

    // 2. 各ユーザーの最終アクセス日時をチェック
    // @upstash/redis の mget はキーが存在しない場合 null を返す
    const lastAccessTimestamps =
      lastAccessKeys.length > 0 ? await kv.mget(...lastAccessKeys) : [];

    for (let i = 0; i < lastAccessKeys.length; i++) {
      const key = lastAccessKeys[i];
      const lastAccessTime = lastAccessTimestamps[i];

      if (typeof lastAccessTime !== "number") {
        console.warn(
          `[CRON-DELETE] Invalid timestamp for key ${key}. Skipping.`,
        );
        continue;
      }

      if (now - lastAccessTime > SIX_MONTHS_IN_MS) {
        const userId = parseKvKey(key).split(":")[1];
        inactiveUserIds.push(userId);
      }
    }

    // 3. 非アクティブユーザーの関連データを削除
    if (inactiveUserIds.length > 0) {
      console.log(
        `[CRON-DELETE] Found ${inactiveUserIds.length} inactive users to delete.`,
      );
      const deletionPromises = inactiveUserIds.map(async (userId) => {
        console.log(`[CRON-DELETE] Deleting data for inactive user: ${userId}`);

        // a. ユーザーの全リマインダーキーを取得
        const reminderKeysToDelete = [];
        let reminderCursor = 0;
        // NOTE: ここもscanをバッチ化すべきだが、まずはユーザー削除を優先
        do {
          const [nextReminderCursor, keys] = await kv.scan(reminderCursor, {
            match: getKvKey(`reminder:${userId}:*`),
            count: 1000,
          });
          reminderCursor = nextReminderCursor;
          reminderKeysToDelete.push(...keys);
        } while (reminderCursor !== "0" && reminderCursor !== 0);

        const tx = kv.multi();

        if (reminderKeysToDelete.length > 0) {
          // b. Sorted Setからリマインダーを削除
          tx.zrem(getKvKey("reminders_by_time"), ...reminderKeysToDelete);

          // c. リマインダー本体を削除
          tx.del(...reminderKeysToDelete);
          console.log(
            `[CRON-DELETE] Queued deletion of ${reminderKeysToDelete.length} reminders for user ${userId}.`,
          );
        }

        // d. 購読情報を削除
        const subscriptionKey = getKvKey(`user:${userId}:subscriptions`);
        tx.del(subscriptionKey);
        console.log(
          `[CRON-DELETE] Queued deletion of subscription for user ${userId}.`,
        );

        // e. 最終アクセス記録を削除
        const lastAccessKey = getKvKey(`user_last_access:${userId}`);
        tx.del(lastAccessKey);
        console.log(
          `[CRON-DELETE] Queued deletion of last access record for user ${userId}.`,
        );

        // f. 公開鍵を削除 (追加)
        const publicKeyKey = getKvKey(`user:${userId}:public_key`);
        tx.del(publicKeyKey);
        console.log(
          `[CRON-DELETE] Queued deletion of public key for user ${userId}.`,
        );

        // トランザクションを実行
        await tx.exec();
        console.log(
          `[CRON-DELETE] Successfully deleted data for user ${userId}.`,
        );
      });

      await Promise.all(deletionPromises);
    } else {
      console.log(
        "[CRON-DELETE] No inactive users found to delete in this batch.",
      );
    }

    // 4. アクセス記録がないユーザーに初期レコードを作成する処理 (バッチ化)
    console.log(
      "[CRON-DELETE] Starting process to add access records for new/untracked users.",
    );

    // reminder:* からuserIdを収集
    const {
      scanComplete: reminderScanComplete,
      nextCursor: nextReminderCursor,
    } = await scanKeysAndStoreUserIds(
      CRON_REMINDER_SCAN_CURSOR_KEY,
      TEMP_ALL_USER_IDS_KEY,
      "reminder:*",
      SCAN_COUNT,
    );

    // user_last_access:* からuserIdを収集
    const {
      scanComplete: lastAccessScanComplete,
      nextCursor: nextLastAccessCursor,
    } = await scanKeysAndStoreUserIds(
      CRON_LAST_ACCESS_SCAN_CURSOR_KEY, // CRON_SCAN_CURSOR_KEYから変更
      TEMP_USERS_WITH_ACCESS_RECORD_KEY,
      "user_last_access:*",
      SCAN_COUNT,
    );

    // 両方のスキャンが完了した場合のみ、初期レコード作成とクリーンアップを実行
    if (reminderScanComplete && lastAccessScanComplete) {
      console.log("[CRON-DELETE] All user scans are complete. Processing...");

      const allUserIdsSet = new Set(
        (await kv.smembers(TEMP_ALL_USER_IDS_KEY)) || [],
      );
      const usersWithAccessRecordSet = new Set(
        (await kv.smembers(TEMP_USERS_WITH_ACCESS_RECORD_KEY)) || [],
      );

      const usersWithoutAccessRecord = new Set(
        [...allUserIdsSet].filter(
          (userId) => !usersWithAccessRecordSet.has(userId),
        ),
      );

      if (usersWithoutAccessRecord.size > 0) {
        console.log(
          `[CRON-DELETE] Found ${usersWithoutAccessRecord.size} users without access records. Creating initial records.`,
        );
        const creationTx = kv.multi();
        const timestamp = Date.now();
        for (const userId of usersWithoutAccessRecord) {
          const lastAccessKey = `user_last_access:${userId}`;
          creationTx.set(lastAccessKey, timestamp, { nx: true }); // nx: true で既存は上書きしない
          // Public Key も初期登録しておく (オプションだが、整合性を保つため)
          // ただし、この段階では公開鍵は不明なので、クライアントからの初回リクエスト時に登録されるTOFUに任せる。
        }
        await creationTx.exec();
        console.log("[CRON-DELETE] Finished creating initial access records.");
      } else {
        console.log("[CRON-DELETE] All existing users have access records.");
      }

      // クリーンアップ
      await kv.del(CRON_REMINDER_SCAN_CURSOR_KEY);
      await kv.del(CRON_LAST_ACCESS_SCAN_CURSOR_KEY);
      await kv.del(TEMP_ALL_USER_IDS_KEY);
      await kv.del(TEMP_USERS_WITH_ACCESS_RECORD_KEY);
      console.log("[CRON-DELETE] Cleanup of temporary scan data complete.");
    } else {
      console.log(
        "[CRON-DELETE] User scans not yet complete. Will continue in next run.",
      );
    }

    // レスポンスのmessageとnextCursorを調整
    const isJobComplete =
      reminderScanComplete && lastAccessScanComplete && isScanFinished;

    if (isJobComplete) {
      console.log(
        `[CRON-DELETE] --- Inactive User Deletion Job End (All Scans Complete) ---`,
      );
    } else {
      console.log(
        `[CRON-DELETE] --- Inactive User Deletion Job Paused (Scans Not Complete) ---`,
      );
    }

    return response.status(200).json({
      message: `Processed inactive user deletion and records creation for this batch. Deleted ${inactiveUserIds.length} users. All scans ${isJobComplete ? "complete." : "continuing in next run."}`,
      deletedUsers: inactiveUserIds,
      // 次のカーソル情報は、ジョブ全体の完了状態を示すために調整する
      jobComplete: isJobComplete,
      scanStatus: {
        lastAccessScan: {
          complete: lastAccessScanComplete,
          nextCursor: nextLastAccessCursor,
        },
        reminderScan: {
          complete: reminderScanComplete,
          nextCursor: nextReminderCursor,
        },
      },
      inactiveUserDeletionScan: {
        complete: nextCursor === 0,
        nextCursor: nextCursor,
      },
    });
  } catch (error) {
    console.error(
      "[CRON-DELETE] Uncaught error in inactive user deletion job:",
      error,
      error.stack,
    );
    return response
      .status(500)
      .json({ error: "Internal Server Error in cron job." });
  }
}
