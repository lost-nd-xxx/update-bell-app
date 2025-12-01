// functions/api/delete-reminder.js
// リマインダーをKVから削除するFunctions

export async function onRequestPost({ request, env }) {
  try {
    console.log(`[DEBUG] delete-reminder: Request received at ${new Date().toISOString()}`);

    // リクエストボディからリマインダーIDとユーザーIDを受け取る
    const { reminderId, userId } = await request.json();

    console.log(`[DEBUG] delete-reminder: Received userId: ${userId}, Reminder ID: ${reminderId}`);

    if (!reminderId || !userId) {
      console.error("[ERROR] delete-reminder: Missing reminderId or userId.");
      return new Response("Missing reminderId or userId.", { status: 400 });
    }

    const reminderKey = `reminder:${userId}:${reminderId}`;

    // リマインダーをKVから削除
    await env.REMINDER_STORE.delete(reminderKey);
    console.log(`[INFO] delete-reminder: Reminder ${reminderKey} deleted from KV.`);

    return new Response("Reminder deleted successfully.", { status: 200 });

  } catch (error) {
    console.error("[ERROR] delete-reminder: Uncaught error:", error);
    return new Response(`Error deleting reminder: ${error.message}`, { status: 500 });
  }
}
