import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import pkg from "./package.json" with { type: "json" };

// ...
export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";
  const isDevelopment = mode === "development";
  const isVercelDevMode = mode === "vercel-dev";

  // mkcert証明書の存在確認
  const certPath = "localhost.pem";
  const keyPath = "localhost-key.pem";
  const hasMkcertCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

  // HTTPSを有効にするかどうかの判定ロジック
  // mkcert証明書があり、かつvercel-devモードではない場合のみHTTPSを有効にする
  const enableHttps = hasMkcertCerts && !isVercelDevMode;

  return {
    plugins: [
      react({
        include: "**/*.{jsx,tsx}",
      }),
    ],

    // ビルド設定
    build: {
      target: "esnext",
      sourcemap: isProduction ? false : true,

      rollupOptions: {
        input: "./index.html", // index.htmlを明示的なエントリポイントとして設定
        output: {
          manualChunks: {
            vendor: ["react", "react-dom"],
            lucide: ["lucide-react"],
          },
        },
      },
    },

    // サーバー設定
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
      host: "localhost",
      open: !isVercelDevMode, // vercel-devモードでは自動的にブラウザを開かない
      cors: true,
      // vercel-devモードではHMRを無効化してECONNRESETを回避
      hmr: isVercelDevMode ? false : true,
      proxy: isVercelDevMode
        ? {
            "/api": {
              target: "http://localhost:3000",
              changeOrigin: true,
              configure: (proxy, _options) => {
                proxy.on("error", (err, _req, _res) => {
                  console.log("proxy error", err);
                });
                proxy.on("proxyReq", (proxyReq, req, _res) => {
                  console.log(
                    "Sending Request to the Target:",
                    req.method,
                    req.url,
                  );
                });
                proxy.on("proxyRes", (proxyRes, req, _res) => {
                  console.log(
                    "Received Response from the Target:",
                    proxyRes.statusCode,
                    req.url,
                  );
                });
              },
            },
          }
        : {
            "/api": {
              target: {
                host: "update-bell-app.vercel.app",
                port: 443, // HTTPSのデフォルトポート
                protocol: "https:",
              },
              changeOrigin: true,
              secure: false, // 自己署名証明書を許可
              configure: (proxy, _options) => {
                proxy.on("error", (err, _req, _res) => {
                  console.log("proxy error", err);
                });
                proxy.on("proxyReq", (proxyReq, req, _res) => {
                  console.log(
                    "Sending Request to the Target:",
                    req.method,
                    req.url,
                  );
                });
                proxy.on("proxyRes", (proxyRes, req, _res) => {
                  console.log(
                    "Received Response from the Target:",
                    proxyRes.statusCode,
                    req.url,
                  );
                });
              },
            },
          },
      // HTTPS設定を条件付きで適用
      ...(enableHttps && {
        https: {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        },
        hmr: {
          protocol: "wss",
          host: "localhost",
        },
      }),
    },
    // プレビュー設定
    preview: {
      port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
      host: "localhost",
      open: true,
      // previewもHTTPS設定を条件付きで適用
      ...(enableHttps && {
        https: {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        },
      }),
    },

    define: {
      __IS_DEVELOPMENT__: JSON.stringify(isDevelopment),
      __IS_PRODUCTION__: JSON.stringify(isProduction),
      "process.env.APP_VERSION": JSON.stringify(pkg.version),
    },
    esbuild: {},
  };
});
