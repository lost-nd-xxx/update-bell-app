import { useState, useCallback } from "react";
import { ToastType } from "../components/ToastMessage";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface UseToast {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

export const useToast = (): UseToast => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    // removeToast を先に定義
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "info", duration?: number) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; // ユニークなIDを生成
      // タイプに応じてデフォルトのdurationを決定
      const finalDuration = duration ?? (type === "success" ? 10000 : 20000);
      const newToast: Toast = { id, message, type, duration: finalDuration };

      setToasts((prevToasts) => {
        const updatedToasts = [...prevToasts, newToast];
        // 最大5個のトーストを保持
        if (updatedToasts.length > 5) {
          return updatedToasts.slice(updatedToasts.length - 5);
        }
        return updatedToasts;
      });

      if (finalDuration > 0) {
        setTimeout(() => {
          removeToast(id); // removeToast は既に定義されている
        }, finalDuration);
      }
    },
    [removeToast],
  ); // 依存配列も更新

  return { toasts, addToast, removeToast };
};
