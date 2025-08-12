import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { getServiceWorkerDebugger } from "./utils/serviceWorkerDebug.ts";

// Service Worker登録
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      console.log("SW registered:", registration);

      // デバッガー初期化
      const swDebugger = getServiceWorkerDebugger();

      // デバッグ用グローバル変数（開発時のみ）
      if (import.meta.env.DEV) {
        (window as Window & { swDebug?: typeof swDebugger }).swDebug =
          swDebugger;
      }
    } catch (error) {
      console.error("SW registration failed:", error);
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
