import { Redis } from "@upstash/redis";
import { verifySignature } from "./_utils/auth.js";
import { checkRateLimit } from "./_utils/ratelimit.js";
import { calculateNextNotificationTime } from "./_utils/notification-helpers.js";
import {
  getKvKey,
  validateAndSanitizeUserId,
  validateAndSanitizeReminderId,
} from "./_utils/kv-utils.js";

const kv = Redis.fromEnv();

const MAX_REMINDERS_PER_USER = 50; // User limit
const TITLE_MAX_LENGTH = 100;
const URL_MAX_LENGTH = 500;
const TAG_MAX_LENGTH = 20;

export default async function handler(request, response) {
  // 1. Rate Limiting
  const { success, limit, remaining, reset } = await checkRateLimit(request);
  if (!success) {
    response.setHeader("RateLimit-Limit", limit);
    response.setHeader("RateLimit-Remaining", remaining);
    response.setHeader("RateLimit-Reset", new Date(reset).toISOString());
    return response.status(429).json({ error: "Too Many Requests" });
  }

  // 2. Authentication (Signature Verification)
  // GET requests might pass parameters in query, others in body.
  // Assuming GET doesn't need signature for public data, BUT this is private user data.
  // So ALL methods require signature verification.
  const authResult = await verifySignature(request, request.body);
  if (!authResult.success) {
    return response
      .status(authResult.status || 401)
      .json({ error: authResult.error });
  }

  const { userId } = request.body || {}; // verifySignature checks body consistency

  if (!userId) {
    return response.status(400).json({ error: "userId is required" });
  }

  // Validate and sanitize userId to prevent NoSQL injection
  let sanitizedUserId;
  try {
    sanitizedUserId = validateAndSanitizeUserId(userId);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }

  try {
    switch (request.method) {
      case "GET":
        return await handleGet(sanitizedUserId, response);
      case "POST":
        return await handlePost(sanitizedUserId, request.body, response);
      case "PUT":
        return await handlePut(sanitizedUserId, request.body, response);
      case "DELETE":
        return await handleDelete(sanitizedUserId, request.body, response);
      default:
        return response.status(405).json({ error: "Method Not Allowed" });
    }
  } catch (error) {
    console.error(
      `[API] Error in reminders.js for user ${sanitizedUserId}:`,
      error,
    );
    return response.status(500).json({ error: "Internal Server Error" });
  }
}

// --- Handlers ---

async function handleGet(userId, response) {
  // Fetch all reminders for the user
  const userRemindersKey = getKvKey(`user:${userId}:reminder_keys`);
  const reminderKeys = await kv.smembers(userRemindersKey);

  if (!reminderKeys || reminderKeys.length === 0) {
    return response.status(200).json({ reminders: [] });
  }

  const reminders = await kv.mget(...reminderKeys);
  // Filter out any nulls (in case of inconsistency)
  const validReminders = reminders.filter((r) => r !== null);

  return response.status(200).json({ reminders: validReminders });
}

async function handlePost(userId, body, response) {
  // Create a single reminder
  const { reminder } = body;
  if (!reminder) {
    return response.status(400).json({ error: "reminder object is required" });
  }

  const validation = validateReminder(reminder);
  if (!validation.valid) {
    return response.status(400).json({ error: validation.error });
  }

  // Validate and sanitize reminderId to prevent NoSQL injection
  let sanitizedReminderId;
  try {
    sanitizedReminderId = validateAndSanitizeReminderId(reminder.id);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }

  const userRemindersKey = getKvKey(`user:${userId}:reminder_keys`);
  const currentCount = await kv.scard(userRemindersKey);

  if (currentCount >= MAX_REMINDERS_PER_USER) {
    return response
      .status(400)
      .json({ error: `Reminder limit reached (${MAX_REMINDERS_PER_USER})` });
  }

  const reminderKey = getKvKey(`reminder:${userId}:${sanitizedReminderId}`);

  // Check if exists
  const exists = await kv.exists(reminderKey);
  if (exists) {
    return response.status(409).json({ error: "Reminder already exists" });
  }

  const reminderToStore = {
    ...reminder,
    userId,
    status: "pending",
    retryCount: 0,
    updatedAt: new Date().toISOString(),
  };

  const multi = kv.multi();
  multi.set(reminderKey, reminderToStore);
  multi.sadd(userRemindersKey, reminderKey);

  // Update schedule index
  updateScheduleIndex(multi, reminderKey, reminder.schedule);

  await multi.exec();

  return response
    .status(201)
    .json({ message: "Reminder created", reminder: reminderToStore });
}

async function handlePut(userId, body, response) {
  if (body.sync) {
    return await handleBatchSync(userId, body.reminders, response);
  }

  // Update single reminder
  const { reminder } = body;
  if (!reminder || !reminder.id) {
    return response
      .status(400)
      .json({ error: "Valid reminder object with ID is required" });
  }

  // Validate and sanitize reminderId to prevent NoSQL injection
  let sanitizedReminderId;
  try {
    sanitizedReminderId = validateAndSanitizeReminderId(reminder.id);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }

  const reminderKey = getKvKey(`reminder:${userId}:${sanitizedReminderId}`);
  const existing = await kv.get(reminderKey);

  if (!existing) {
    return response.status(404).json({ error: "Reminder not found" });
  }

  const validation = validateReminder(reminder);
  if (!validation.valid) {
    return response.status(400).json({ error: validation.error });
  }

  const reminderToStore = {
    ...existing,
    ...reminder, // Overwrite with new data
    userId, // Ensure userId doesn't change
    updatedAt: new Date().toISOString(),
  };

  const multi = kv.multi();
  multi.set(reminderKey, reminderToStore);

  // Update schedule index (Remove old, Add new is handled loosely by zadd if key same? No, sorted set is by score/member)
  // Actually, we should just update the score for this member.
  updateScheduleIndex(multi, reminderKey, reminder.schedule);

  await multi.exec();

  return response
    .status(200)
    .json({ message: "Reminder updated", reminder: reminderToStore });
}

async function handleDelete(userId, body, response) {
  const { reminderId } = body;
  if (!reminderId) {
    return response.status(400).json({ error: "reminderId is required" });
  }

  // Validate and sanitize reminderId to prevent NoSQL injection
  let sanitizedReminderId;
  try {
    sanitizedReminderId = validateAndSanitizeReminderId(reminderId);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }

  const reminderKey = getKvKey(`reminder:${userId}:${sanitizedReminderId}`);
  const userRemindersKey = getKvKey(`user:${userId}:reminder_keys`);

  const multi = kv.multi();
  multi.del(reminderKey);
  multi.srem(userRemindersKey, reminderKey);
  multi.zrem(getKvKey("reminders_by_time"), reminderKey); // Remove from schedule index

  await multi.exec();

  return response.status(200).json({ message: "Reminder deleted" });
}

async function handleBatchSync(userId, reminders, response) {
  if (!Array.isArray(reminders)) {
    return response
      .status(400)
      .json({ error: "reminders array required for sync" });
  }

  if (reminders.length > MAX_REMINDERS_PER_USER) {
    return response
      .status(400)
      .json({ error: `Too many reminders. Max ${MAX_REMINDERS_PER_USER}` });
  }

  // Validate all
  for (const r of reminders) {
    const v = validateReminder(r);
    if (!v.valid)
      return response
        .status(400)
        .json({ error: `Invalid reminder: ${v.error}` });

    // Validate and sanitize reminderId to prevent NoSQL injection
    try {
      validateAndSanitizeReminderId(r.id);
    } catch (error) {
      return response.status(400).json({ error: error.message });
    }
  }

  const userRemindersKey = getKvKey(`user:${userId}:reminder_keys`);

  // Get current keys to find what to delete (optional, but good for true sync)
  // For simplicity in this "overwrite" sync, we can delete all old for this user and set new.
  // BUT, deleting all might be risky if network fails halfway.
  // Better strategy:
  // 1. Calculate new keys.
  // 2. Identify keys to remove (Old - New).
  // 3. Multi exec: Set new/updated, Remove deleted.

  const oldKeys = await kv.smembers(userRemindersKey);
  const newKeys = reminders.map((r) => getKvKey(`reminder:${userId}:${r.id}`));
  const keysToRemove = oldKeys.filter((k) => !newKeys.includes(k));

  if (keysToRemove.length === 0 && reminders.length === 0) {
    return response
      .status(200)
      .json({ message: "Sync complete (nothing to update)", count: 0 });
  }

  const multi = kv.multi();

  // Remove deleted
  for (const k of keysToRemove) {
    multi.del(k);
    multi.srem(userRemindersKey, k);
    multi.zrem(getKvKey("reminders_by_time"), k);
  }

  // Set/Update new
  for (const r of reminders) {
    const key = getKvKey(`reminder:${userId}:${r.id}`);
    const data = {
      ...r,
      userId,
      status: "pending",
      retryCount: 0,
      updatedAt: new Date().toISOString(),
    };
    multi.set(key, data);
    multi.sadd(userRemindersKey, key);
    updateScheduleIndex(multi, key, r.schedule);
  }

  await multi.exec();

  return response
    .status(200)
    .json({ message: "Sync complete", count: reminders.length });
}

// --- Helpers ---

function validateReminder(reminder) {
  if (!reminder.id || typeof reminder.id !== "string")
    return { valid: false, error: "Invalid ID" };
  if (
    !reminder.title ||
    typeof reminder.title !== "string" ||
    reminder.title.length > TITLE_MAX_LENGTH
  ) {
    return { valid: false, error: "Title invalid or too long" };
  }
  if (
    reminder.url &&
    (typeof reminder.url !== "string" || reminder.url.length > URL_MAX_LENGTH)
  ) {
    return { valid: false, error: "URL invalid or too long" };
  }
  if (
    reminder.tags &&
    (!Array.isArray(reminder.tags) ||
      reminder.tags.some((t) => t.length > TAG_MAX_LENGTH))
  ) {
    return { valid: false, error: "Tags invalid" };
  }
  // Basic sanitization should happen on client display, but we validate types here.
  // "schedule" validation depends on the structure (cron-like or simple). Assuming object.
  if (!reminder.schedule || typeof reminder.schedule !== "object") {
    return { valid: false, error: "Invalid schedule" };
  }
  return { valid: true };
}

function updateScheduleIndex(multi, reminderKey, schedule) {
  const nextTime = calculateNextNotificationTime(schedule);
  if (nextTime) {
    multi.zadd(getKvKey("reminders_by_time"), {
      score: nextTime.getTime(),
      member: reminderKey,
    });
  } else {
    // If no next time (e.g. paused or finished), ensure it's not in the schedule
    multi.zrem(getKvKey("reminders_by_time"), reminderKey);
  }
}
