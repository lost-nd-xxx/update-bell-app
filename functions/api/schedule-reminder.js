// functions/api/schedule-reminder.js
// リマインダーのスケジュールと保存を処理するFunctions

export async function onRequestPost({ request, env }) {
  try {
    console.log(`[DEBUG] schedule-reminder: Request received at ${new Date().toISOString()}`);

    // リクエストボディからリマインダーデータを受け取る
    const { reminder, userId } = await request.json();

    console.log(`[DEBUG] schedule-reminder: Received userId: ${userId}, Reminder ID: ${reminder?.reminderId}`);
    console.log(`[DEBUG] schedule-reminder: Received Reminder Data:`, JSON.stringify(reminder, null, 2));


    if (!reminder || !userId || !reminder.reminderId) {
      console.error("[ERROR] schedule-reminder: Missing reminder data or userId.");
      return new Response("Missing reminder data or userId.", { status: 400 });
    }

    const reminderKey = `reminder:${userId}:${reminder.reminderId}`;
    const userSubscriptionKey = `user:${userId}:subscriptions`;

    // リマインダーをKVに保存
    await env.REMINDER_STORE.put(reminderKey, JSON.stringify(reminder));
    console.log(`[INFO] schedule-reminder: Reminder ${reminderKey} saved to KV.`);

    // ユーザーのサブスクリプションを更新（既存のサブスクリプションに追加）
    // リマインダー保存時にサブスクリプション情報も更新されることを想定
    if (reminder.subscription) {
      console.log(`[DEBUG] schedule-reminder: Subscription data found for userId: ${userId}`);
      let subscriptions = (await env.REMINDER_STORE.get(userSubscriptionKey, "json")) || [];
      
      // 既存のサブスクリプションがあれば更新、なければ追加
      const existingSubscriptionIndex = subscriptions.findIndex(
        (sub) => sub.endpoint === reminder.subscription.endpoint
      );

      if (existingSubscriptionIndex > -1) {
        subscriptions[existingSubscriptionIndex] = reminder.subscription;
        console.log(`[INFO] schedule-reminder: Updated existing subscription for user ${userId}.`);
      } else {
        subscriptions.push(reminder.subscription);
        console.log(`[INFO] schedule-reminder: Added new subscription for user ${userId}.`);
      }

      await env.REMINDER_STORE.put(userSubscriptionKey, JSON.stringify(subscriptions));
      console.log(`[INFO] schedule-reminder: User subscriptions for ${userId} updated in KV.`);
    } else {
      console.log(`[DEBUG] schedule-reminder: No subscription data in reminder.`);
    }


    return new Response("Reminder scheduled successfully.", { status: 200 });

  } catch (error) {
    console.error("[ERROR] schedule-reminder: Uncaught error:", error);
    return new Response(`Error scheduling reminder: ${error.message}`, { status: 500 });
  }
}