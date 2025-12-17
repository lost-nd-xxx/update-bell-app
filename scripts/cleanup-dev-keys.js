// scripts/cleanup-dev-keys.js
// 開発環境のプレフィックス付きキーを削除する

// 実行方法：
// `node --env-file=.env scripts/cleanup-dev-keys.js`

import { Redis } from "@upstash/redis";
import readline from "readline";

const kv = Redis.fromEnv();

// ユーザー入力を取得する関数
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

async function cleanup() {
  const prefix = process.env.KV_PREFIX || "dev:";

  console.log(`Scanning for "${prefix}*" keys...\n`);

  let cursor = 0;
  let totalFound = 0;
  const allKeys = [];

  // キーをスキャン
  do {
    const [nextCursor, keys] = await kv.scan(cursor, {
      match: `${prefix}*`,
      count: 100,
    });

    cursor = nextCursor;

    if (keys.length > 0) {
      totalFound += keys.length;
      allKeys.push(...keys);
      console.log(`Found ${keys.length} keys (total: ${totalFound})`);
    }
  } while (cursor !== "0" && cursor !== 0);

  if (totalFound === 0) {
    console.log(`\nNo keys found matching "${prefix}*"`);
    return;
  }

  // 全キーを表示
  console.log(`\n=== Found ${totalFound} keys matching "${prefix}*" ===`);
  allKeys.forEach((key) => console.log(`  - ${key}`));

  // 削除確認
  console.log(`\n⚠️  WARNING: This will delete ${totalFound} keys!`);
  const answer = await askQuestion(
    "Do you want to proceed with deletion? (yes/no): ",
  );

  if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
    console.log("\n❌ Deletion cancelled.");
    return;
  }

  // 削除処理
  console.log(`\nDeleting ${totalFound} keys...`);

  let deletedCount = 0;
  // 100個ずつ削除
  for (let i = 0; i < allKeys.length; i += 100) {
    const batch = allKeys.slice(i, i + 100);
    await kv.del(...batch);
    deletedCount += batch.length;
    console.log(`Deleted ${batch.length} keys (total: ${deletedCount})`);
  }

  console.log(`\n✓ Cleanup complete. Total deleted: ${deletedCount} keys`);
}

cleanup().catch(console.error);
