// functions/api/save-subscription.js

export async function onRequestPost({ request, env }) {
  try {
    const { userId, subscription } = await request.json();

    if (!userId || !subscription) {
      return new Response(JSON.stringify({ error: "Missing userId or subscription" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const key = `user:${userId}:subscriptions`;
    let subscriptions = [];
    const existing = await env.REMINDER_STORE.get(key, "json");

    if (existing) {
      subscriptions = existing;
    }

    // 既に登録されているSubscriptionかチェック
    const isAlreadySubscribed = subscriptions.some(
      (sub) => sub.endpoint === subscription.endpoint
    );

    if (!isAlreadySubscribed) {
      subscriptions.push(subscription);
      await env.REMINDER_STORE.put(key, JSON.stringify(subscriptions));
    }

    return new Response(JSON.stringify({ message: "Subscription saved successfully" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error saving subscription:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
