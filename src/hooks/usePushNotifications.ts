// src/hooks/usePushNotifications.ts
import { useState, useEffect } from "react";
import { useUserId } from "../contexts/UserIdContext";
import { ToastType } from "../components/ToastMessage"; // 追加
import { getErrorMessage } from "../utils/helpers"; // 追加

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

export const usePushNotifications = (
  addToast: (message: string, type?: ToastType, duration?: number) => void, // 追加
) => {
  const userId = useUserId();
  const [isSubscribing, setIsSubscribing] = useState(false);
  // const [error, setError] = useState<string | null>(null); // 削除
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
          addToast(
            `購読情報の取得に失敗しました: ${getErrorMessage(error)}`,
            "error",
          ); // 変更
        }
      }
    };
    getExistingSubscription();
  }, [addToast]);

  const subscribeToPushNotifications = async () => {
    if (!VAPID_PUBLIC_KEY) {
      addToast(
        "アプリケーションの設定に問題があります。VAPID公開鍵が設定されていません。",
        "error",
      ); // 変更
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      addToast("このブラウザはプッシュ通知に対応していません。", "error"); // 変更
      return;
    }

    setIsSubscribing(true);
    // setError(null); // 削除

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
      addToast("プッシュ通知を有効にしました。", "success"); // 追加
    } catch (err) {
      // console.error(err); // 削除
      if (err instanceof Error && err.name === "NotAllowedError") {
        addToast(
          "通知がブロックされています。ブラウザの設定を確認してください。",
          "error",
        ); // 変更
      } else {
        addToast(
          `プッシュ通知の有効化に失敗しました: ${getErrorMessage(err)}`,
          "error",
        ); // 変更
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
      addToast("プッシュ通知を無効にしました。", "info"); // 追加
    } catch (error) {
      addToast(
        `プッシュ通知の解除に失敗しました: ${getErrorMessage(error)}`,
        "error",
      ); // 変更
    }
  };

  return {
    subscribeToPushNotifications,
    unsubscribeFromPushNotifications,
    isSubscribing,
    subscription,
    // error, // 削除
  };
};
