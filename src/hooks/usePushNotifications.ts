// src/hooks/usePushNotifications.ts
import { useState, useEffect } from "react";
import { useUserId } from "../contexts/UserIdContext";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const usePushNotifications = () => {
  const userId = useUserId();
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );

  useEffect(() => {
    const getExistingSubscription = async () => {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const sub = await registration.pushManager.getSubscription();
          setSubscription(sub);
        } catch (error) {
          console.error("Error getting subscription:", error);
        }
      }
    };
    getExistingSubscription();
  }, []);

  const subscribeToPushNotifications = async () => {
    if (!VAPID_PUBLIC_KEY) {
      console.error(
        "VAPID public key is not defined. Please set VITE_VAPID_PUBLIC_KEY in your .env file.",
      );
      setError("アプリケーションの設定に問題があります。");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setError("このブラウザはプッシュ通知に対応していません。");
      return;
    }

    setIsSubscribing(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      await fetch("/api/save-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, subscription: sub }),
      });
      setSubscription(sub);
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError(
          "通知がブロックされています。ブラウザの設定を確認してください。",
        );
      } else {
        setError("プッシュ通知の有効化に失敗しました。");
      }
      setSubscription(null);
    } finally {
      setIsSubscribing(false);
    }
  };

  const unsubscribeFromPushNotifications = async () => {
    if (!subscription) return;

    try {
      await subscription.unsubscribe();
      // TODO: サーバーに購読解除を通知するAPIを呼ぶ
      setSubscription(null);
    } catch (error) {
      console.error("Failed to unsubscribe:", error);
      setError("プッシュ通知の解除に失敗しました。");
    }
  };

  return {
    subscribeToPushNotifications,
    unsubscribeFromPushNotifications,
    isSubscribing,
    subscription,
    error,
  };
};
