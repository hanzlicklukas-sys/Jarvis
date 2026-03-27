'use strict';

let schedule;
try { schedule = require('node-schedule'); } catch { schedule = null; }

const reminders = new Map();
let reminderCounter = 1;

/**
 * Schedule a one-time reminder
 * @param {string} message
 * @param {Date|string} date - when to fire
 * @param {function} callback - called with message when fired
 * @returns {string} reminder id
 */
function scheduleReminder(message, date, callback) {
  if (!schedule) {
    console.warn('[scheduler] node-schedule not available');
    return null;
  }

  const id = `reminder_${reminderCounter++}`;
  const fireDate = date instanceof Date ? date : new Date(date);

  const job = schedule.scheduleJob(id, fireDate, () => {
    try {
      callback(message);
    } catch (err) {
      console.error('[scheduler] Reminder callback error:', err.message);
    }
    reminders.delete(id);
  });

  if (!job) {
    console.warn(`[scheduler] Could not schedule reminder for ${fireDate.toISOString()} (date in the past?)`);
    return null;
  }

  reminders.set(id, {
    id,
    message,
    fireDate: fireDate.toISOString(),
    job
  });

  return id;
}

/**
 * Cancel a scheduled reminder
 * @param {string} id
 * @returns {boolean}
 */
function cancelReminder(id) {
  const reminder = reminders.get(id);
  if (!reminder) return false;

  try {
    reminder.job.cancel();
  } catch { /* ignore */ }

  reminders.delete(id);
  return true;
}

/**
 * List all pending reminders
 * @returns {Array}
 */
function listReminders() {
  return Array.from(reminders.values()).map(r => ({
    id: r.id,
    message: r.message,
    fireDate: r.fireDate
  }));
}

/**
 * Schedule a daily briefing at a specific hour
 * @param {number} hour - 0-23
 * @param {function} callback
 */
function scheduleDailyBriefing(hour = 9, callback) {
  if (!schedule) {
    console.warn('[scheduler] node-schedule not available, skipping daily briefing');
    return;
  }

  const rule = new schedule.RecurrenceRule();
  rule.hour = hour;
  rule.minute = 0;
  rule.second = 0;

  const job = schedule.scheduleJob('daily_briefing', rule, () => {
    try {
      callback();
    } catch (err) {
      console.error('[scheduler] Daily briefing callback error:', err.message);
    }
  });

  if (job) {
    console.log(`[scheduler] Daily briefing scheduled for ${hour}:00 every day`);
  }

  return job;
}

/**
 * Hourly proactive check (polls to see if JARVIS should say something)
 * @param {function} callback - called each hour with current Date
 */
function scheduleHourlyCheck(callback) {
  if (!schedule) return;

  const rule = new schedule.RecurrenceRule();
  rule.minute = 0;

  return schedule.scheduleJob('hourly_check', rule, () => {
    try {
      callback(new Date());
    } catch (err) {
      console.error('[scheduler] Hourly check error:', err.message);
    }
  });
}

module.exports = {
  scheduleReminder,
  cancelReminder,
  listReminders,
  scheduleDailyBriefing,
  scheduleHourlyCheck
};
