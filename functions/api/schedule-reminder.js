// functions/api/schedule-reminder.js

export async function onRequestPost({ request, env }) {
  try {
    const { userId, reminderId, message, scheduledTime, url } = await request.json();

    if (!userId || !reminderId || !message || !scheduledTime) {
      return new Response(JSON.stringify({ error: "Missing required reminder fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const key = `reminder:${userId}:${reminderId}`;
    const reminderData = {
      userId,
      reminderId,
      message,
      scheduledTime: new Date(scheduledTime).getTime(), // タイムスタンプに変換
      url, // URLはオプションなので存在する場合のみ
      status: 'pending', // リマインダーのステータス
      createdAt: Date.now(),
    };

    await env.REMINDER_STORE.put(key, JSON.stringify(reminderData));

    return new Response(JSON.stringify({ message: "Reminder scheduled successfully" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error scheduling reminder:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
