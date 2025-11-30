// functions/lib/web-push-shim.js
// Cloudflare Workers環境でweb-pushライブラリのcryptoモジュール互換性を提供するためのShim

import webpush from "web-push";

// Cloudflare Workersの`crypto` APIを`web-push`が利用できるようにする
// web-push@4.x系では、cryptoモジュールのShimが必要になる場合がある
// 参考: https://developers.cloudflare.com/workers/runtime-apis/nodejs/web-push/

// 実際には、webpush.sendNotification が呼び出される前に
// Web Crypto APIが利用可能であることを保証する必要があります。
// しかし、Pages Functionsのnodejs_compat環境では、多くの場合自動的に処理されます。

// web-pushライブラリのsendNotification関数をエクスポート
export const sendNotification = webpush.sendNotification;
export const setVapidDetails = webpush.setVapidDetails;

// VAPIDキーの生成はWorkersランタイムでは推奨されないため、generateVAPIDKeysはエクスポートしない。