// update-bell-app/api/cron/delete-inactive-users.js
import { kv } from "@vercel/kv";

// 半年をミリ秒で定義 (半年 ≒ 182.5日)
const SIX_MONTHS_IN_MS = 182.5 * 24 * 60 * 60 * 1000;

export default async function handler(request, response) {
  // Vercel Cronからのリクエストか、適切なBearerトークンを持つリクエストかを認証
  if (
    process.env.CRON_SECRET &&
    request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    console.warn("[CRON-DELETE] Unauthorized access attempt.");
    return response.status(401).json({ error: "Unauthorized" });
  }

  console.log(
    `[CRON-DELETE] --- Inactive User Deletion Job Start (Time: ${new Date().toISOString()}) ---`,
  );

  try {
    const now = Date.now();
    const inactiveUserIds = [];

    // 1. 全ての最終アクセス記録キーを取得
    const lastAccessKeys = [];
    let cursor = 0;
    do {
      const [nextCursor, keys] = await kv.scan(cursor, {
        match: "user_last_access:*",
        count: 1000,
      });
      cursor = nextCursor;
      lastAccessKeys.push(...keys);
    } while (cursor !== 0);

    if (lastAccessKeys.length === 0) {
      console.log("[CRON-DELETE] No user access records found.");
      return response
        .status(200)
        .json({ message: "No user access records found." });
    }

    console.log(
      `[CRON-DELETE] Found ${lastAccessKeys.length} user access records to check.`,
    );

    // 2. 各ユーザーの最終アクセス日時をチェック
    const lastAccessTimestamps = await kv.mget(...lastAccessKeys);

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
        const userId = key.split(":")[1];
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
        do {
          const [nextCursor, keys] = await kv.scan(reminderCursor, {
            match: `reminder:${userId}:*`,
            count: 1000,
          });
          reminderCursor = nextCursor;
          reminderKeysToDelete.push(...keys);
        } while (reminderCursor !== 0);

        const tx = kv.multi();

        if (reminderKeysToDelete.length > 0) {
          // b. Sorted Setからリマインダーを削除
          tx.zrem("reminders_by_time", ...reminderKeysToDelete);

          // c. リマインダー本体を削除
          tx.del(...reminderKeysToDelete);
          console.log(
            `[CRON-DELETE] Queued deletion of ${reminderKeysToDelete.length} reminders for user ${userId}.`,
          );
        }

        // d. 購読情報を削除
        const subscriptionKey = `user:${userId}:subscriptions`;
        tx.del(subscriptionKey);
        console.log(
          `[CRON-DELETE] Queued deletion of subscription for user ${userId}.`,
        );

        // e. 最終アクセス記録を削除
        const lastAccessKey = `user_last_access:${userId}`;
        tx.del(lastAccessKey);
        console.log(
          `[CRON-DELETE] Queued deletion of last access record for user ${userId}.`,
        );

        // トランザクションを実行
        await tx.exec();
        console.log(
          `[CRON-DELETE] Successfully deleted data for user ${userId}.`,
        );
      });

      await Promise.all(deletionPromises);
    } else {
      console.log("[CRON-DELETE] No inactive users found to delete.");
    }

    // 4. アクセス記録がないユーザーに初期レコードを作成
    console.log(
      "[CRON-DELETE] Starting process to add access records for new/untracked users.",
    );

    const allUserIds = new Set();
    let reminderScanCursor = 0;
    do {
      const [nextCursor, keys] = await kv.scan(reminderScanCursor, {
        match: "reminder:*",
        count: 1000,
      });
      reminderScanCursor = nextCursor;
      for (const key of keys) {
        const parts = key.split(":");
        if (parts.length >= 2) {
          allUserIds.add(parts[1]);
        }
      }
    } while (reminderScanCursor !== 0);

    if (allUserIds.size === 0) {
      console.log(
        "[CRON-DELETE] No users found from reminder keys. Skipping access record creation.",
      );
    } else {
      const usersWithAccessRecord = new Set();
      for (const key of lastAccessKeys) {
        const parts = key.split(":");
        if (parts.length >= 2) {
          usersWithAccessRecord.add(parts[1]);
        }
      }

      const usersWithoutAccessRecord = new Set(
        [...allUserIds].filter((id) => !usersWithAccessRecord.has(id)),
      );

      if (usersWithoutAccessRecord.size > 0) {
        console.log(
          `[CRON-DELETE] Found ${usersWithoutAccessRecord.size} users without access records. Creating initial records.`,
        );
        const creationTx = kv.multi();
        const timestamp = Date.now();
        for (const userId of usersWithoutAccessRecord) {
          const lastAccessKey = `user_last_access:${userId}`;
          creationTx.set(lastAccessKey, timestamp, { nx: true });
        }
        await creationTx.exec();
        console.log("[CRON-DELETE] Finished creating initial access records.");
      } else {
        console.log("[CRON-DELETE] All existing users have access records.");
      }
    }

    console.log(`[CRON-DELETE] --- Inactive User Deletion Job End ---`);
    return response.status(200).json({
      message: `Successfully processed inactive user deletion and records creation. Deleted ${inactiveUserIds.length} users.`,
      deletedUsers: inactiveUserIds,
    });
  } catch (error) {
    console.error(
      "[CRON-DELETE] Uncaught error in inactive user deletion job:",
      error,
    );
    return response
      .status(500)
      .json({ error: "Internal Server Error in cron job." });
  }
}
