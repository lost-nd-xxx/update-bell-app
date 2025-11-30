// functions/lib/web-push-shim.js
// Cloudflare Workers環境でweb-pushライブラリのcryptoモジュール互換性を提供するためのShim

import webpush from "web-push";

// Cloudflare WorkersにはNode.jsのcrypto.subtleのようなAPIがないため、
// web-pushが依存するECDH鍵交換処理をWorkers互換のAPIに置き換えるShimを用意します。

// web-pushの内部で利用されるECDH処理を上書き
// この処理はweb-pushライブラリのバージョンや内部実装に依存する可能性があります。
// 公式ドキュメント: https://developers.cloudflare.com/workers/runtime-apis/nodejs/web-push/
if (webpush.webpush) {
  // web-push@3.x系の場合の互換性レイヤー
  webpush.webpush.generateVAPIDKeys = () => {
    // このShimはWorkersランタイムでVAPIDキーを生成するものではありません
    // VAPIDキーは環境変数として提供されるべきです
    throw new Error("VAPID key generation is not supported in Workers runtime via this shim.");
  };
  webpush.webpush.setVapidDetails = webpush.setVapidDetails;
  webpush.webpush.sendNotification = webpush.sendNotification;
}

// web-pushライブラリのsendNotification関数をエクスポート
export const sendNotification = webpush.sendNotification;
export const setVapidDetails = webpush.setVapidDetails;
