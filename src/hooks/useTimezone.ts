import { useState, useEffect } from "react";
import { Reminder } from "../types";

interface TimezoneChangeData {
  oldTimezone: string;
  newTimezone: string;
  affectedReminders: Reminder[];
}

export const useTimezone = (
  reminders: Reminder[],
  updateReminder: (id: string, updates: Partial<Reminder>) => void
) => {
  const [timezoneChanged, setTimezoneChanged] = useState<TimezoneChangeData | null>(null);

  const getCurrentTimezone = () => {
    return localStorage.getItem("update-bell-timezone") || 
           Intl.DateTimeFormat().resolvedOptions().timeZone;
  };

  const [currentTimezone, setCurrentTimezone] = useState(getCurrentTimezone);

  // タイムゾーンの定期チェック
  useEffect(() => {
    const checkTimezone = () => {
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      if (detectedTimezone !== currentTimezone) {
        const affectedReminders = reminders.filter(
          (reminder) => reminder.timezone !== detectedTimezone
        );

        if (affectedReminders.length > 0) {
          setTimezoneChanged({
            oldTimezone: currentTimezone,
            newTimezone: detectedTimezone,
            affectedReminders,
          });
        }

        setCurrentTimezone(detectedTimezone);
        localStorage.setItem("update-bell-timezone", detectedTimezone);
      }
    };

    const interval = setInterval(checkTimezone, 60 * 60 * 1000);
    checkTimezone();

    return () => clearInterval(interval);
  }, [currentTimezone, reminders]);

  const handleTimezoneChange = (keepCurrentTime: boolean) => {
    if (!timezoneChanged) return;

    const { newTimezone, affectedReminders } = timezoneChanged;

    affectedReminders.forEach((reminder) => {
      updateReminder(reminder.id, {
        timezone: newTimezone,
      });
    });

    setCurrentTimezone(newTimezone);
    localStorage.setItem("update-bell-timezone", newTimezone);
    setTimezoneChanged(null);
  };

  const dismissTimezoneChange = () => {
    if (!timezoneChanged) return;
    localStorage.setItem("update-bell-timezone", timezoneChanged.newTimezone);
    setTimezoneChanged(null);
  };

  return {
    timezoneChanged,
    handleTimezoneChange,
    dismissTimezoneChange,
  };
};