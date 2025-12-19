import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useCallback,
} from "react";
import { useUserId } from "./UserIdContext";
import { ToastType } from "../components/ToastMessage";
import { getErrorMessage } from "../utils/helpers";

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

interface PushNotificationContextType {
  subscription: PushSubscription | null;
  isSubscribing: boolean;
  isSupported: boolean;
  subscribeToPushNotifications: () => Promise<PushSubscription | null>;
  unsubscribeFromPushNotifications: () => Promise<void>;
}

const PushNotificationContext = createContext<
  PushNotificationContextType | undefined
>(undefined);

export const PushNotificationProvider: React.FC<{
  children: ReactNode;
  addToast: (message: string, type?: ToastType, duration?: number) => void;
}> = ({ children, addToast }) => {
  const { userId, getAuthHeaders } = useUserId();
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [isSupported, setIsSupported] = useState(false);

  // 通知機能のサポート判定
  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setIsSupported(supported);
  }, []);

  // 既存の購読情報を取得
  useEffect(() => {
    const getExistingSubscription = async () => {
      if (isSupported) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const sub = await registration.pushManager.getSubscription();
          setSubscription(sub);
        } catch (error) {
          addToast(
            `購読情報の取得に失敗しました: ${getErrorMessage(error)}`,
            "error",
          );
        }
      }
    };
    getExistingSubscription();
  }, [isSupported, addToast]);

  const subscribeToPushNotifications =
    useCallback(async (): Promise<PushSubscription | null> => {
      if (!VAPID_PUBLIC_KEY) {
        addToast(
          "アプリケーションの設定に問題があります。VAPID公開鍵が設定されていません。",
          "error",
        );
        return null;
      }

      if (!isSupported) {
        addToast("このブラウザはプッシュ通知に対応していません。", "error");
        return null;
      }

      setIsSubscribing(true);

      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        const body = { userId, subscription: sub };
        const authHeaders = await getAuthHeaders(body);

        await fetch("/api/subscription", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeaders as Record<string, string>),
          },
          body: JSON.stringify(body),
        });
        setSubscription(sub);
        addToast("プッシュ通知を有効にしました。", "success");
        return sub;
      } catch (err) {
        if (err instanceof Error && err.name === "NotAllowedError") {
          addToast(
            "通知がブロックされています。ブラウザの設定を確認してください。",
            "error",
          );
        } else {
          addToast(
            `プッシュ通知の有効化に失敗しました: ${getErrorMessage(err)}`,
            "error",
          );
        }
        setSubscription(null);
        return null;
      } finally {
        setIsSubscribing(false);
      }
    }, [userId, getAuthHeaders, isSupported, addToast]);

  const unsubscribeFromPushNotifications = useCallback(async () => {
    if (!subscription) return;

    try {
      if (!userId) {
        addToast("ユーザーIDが取得できませんでした。", "error");
        return;
      }

      await subscription.unsubscribe();

      const body = {
        userId,
        subscription: { endpoint: subscription.endpoint },
      };
      const authHeaders = await getAuthHeaders(body);

      const response = await fetch("/api/subscription", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(authHeaders as Record<string, string>),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error("サーバーでの購読解除に失敗しました。");
      }

      setSubscription(null);
      addToast("プッシュ通知を無効にしました。", "info");
    } catch (error) {
      addToast(
        `プッシュ通知の解除に失敗しました: ${getErrorMessage(error)}`,
        "error",
      );
    }
  }, [subscription, userId, getAuthHeaders, addToast]);

  return (
    <PushNotificationContext.Provider
      value={{
        subscription,
        isSubscribing,
        isSupported,
        subscribeToPushNotifications,
        unsubscribeFromPushNotifications,
      }}
    >
      {children}
    </PushNotificationContext.Provider>
  );
};

export const usePushNotifications = (): PushNotificationContextType => {
  const context = useContext(PushNotificationContext);
  if (context === undefined) {
    throw new Error(
      "usePushNotifications must be used within a PushNotificationProvider",
    );
  }
  return context;
};
