// update-bell-app/api/cron/delete-inactive-users.js
import { kv } from "@vercel/kv";

const SIX_MONTHS_IN_MS = 182.5 * 24 * 60 * 60 * 1000;
const CRON_SCAN_CURSOR_KEY = "cron_delete_inactive_users_scan_cursor";
const SCAN_COUNT = 100; // 一度にスキャンするキーの数

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

    // 1. 全ての最終アクセス記録キーを取得 (バッチ処理)
    let cursor = await kv.get(CRON_SCAN_CURSOR_KEY);
    cursor = typeof cursor === "number" ? cursor : 0; // カーソルが存在しない場合は0

    console.log(`[CRON-DELETE] Starting scan from cursor: ${cursor}`);

    const [nextCursor, lastAccessKeys] = await kv.scan(cursor, {
      match: "user_last_access:*",
      count: SCAN_COUNT,
    });

    // 次回のためにカーソルを保存
    await kv.set(CRON_SCAN_CURSOR_KEY, nextCursor);

    if (lastAccessKeys.length === 0 && nextCursor === 0) {
      // スキャンが完全に終了し、新しいキーも見つからなかった場合
      await kv.del(CRON_SCAN_CURSOR_KEY); // カーソルをリセット
      console.log(
        "[CRON-DELETE] No user access records found and scan complete.",
      );
      return response
        .status(200)
        .json({ message: "No user access records found and scan complete." });
    } else if (lastAccessKeys.length === 0 && nextCursor !== 0) {
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
        // NOTE: ここもscanをバッチ化すべきだが、まずはユーザー削除を優先
        do {
          const [nextReminderCursor, keys] = await kv.scan(reminderCursor, {
            match: `reminder:${userId}:*`,
            count: 1000,
          });
          reminderCursor = nextReminderCursor;
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
      console.log(
        "[CRON-DELETE] No inactive users found to delete in this batch.",
      );
    }

    // 4. アクセス記録がないユーザーに初期レコードを作成 (バッチ処理とカーソル管理をここにも適用する必要あり)
    console.log(
      "[CRON-DELETE] Starting process to add access records for new/untracked users. (This part also needs batching)",
    );

    // NOTE: この部分はまだバッチ化されていないため、大量のデータがある場合はタイムアウトの原因になる可能性があります。
    // まずは非アクティブユーザーの削除を優先し、この部分は後で対応します。

    const allUserIds = new Set();
    let reminderScanCursor = 0;
    do {
      const [nextReminderScanCursor, keys] = await kv.scan(reminderScanCursor, {
        match: "reminder:*",
        count: 1000,
      });
      reminderScanCursor = nextReminderScanCursor;
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
      // NOTE: lastAccessKeysは今回のバッチで取得されたもののみなので、
      // 以前処理されたユーザーのアクセス記録はここに含まれない。
      // 全てのusersWithAccessRecordを取得するには、別途スキャンが必要になる。
      // あるいは、allUserIdsの各ユーザーに対してkv.get()を個別に実行する。
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

    // スキャンが完了した場合のみ、ジョブ完了をログ
    if (nextCursor === 0) {
      console.log(
        `[CRON-DELETE] --- Inactive User Deletion Job End (Scan Complete) ---`,
      );
    } else {
      console.log(
        `[CRON-DELETE] --- Inactive User Deletion Job Paused (Scan Not Complete) ---`,
      );
    }

    return response.status(200).json({
      message: `Successfully processed inactive user deletion and records creation for this batch. Deleted ${inactiveUserIds.length} users. Scan ${nextCursor === 0 ? "complete." : `continuing from cursor: ${nextCursor}.`}`,
      deletedUsers: inactiveUserIds,
      nextCursor: nextCursor,
      scanCount: lastAccessKeys.length,
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
