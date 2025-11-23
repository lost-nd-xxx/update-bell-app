import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs"; // 追加
import path from "path"; // 追加
import pkg from './package.json';


export default defineConfig(({ command, mode }) => {
    const isProduction = mode === "production";
    const isDevelopment = mode === "development";
  
    // mkcert証明書の存在確認 (+3を使うように変更)
    const certPath = "localhost+3.pem";
    const keyPath = "localhost+3-key.pem";
    const hasMkcertCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);
  
    return {
      plugins: [
        react({
          include: "**/*.{jsx,tsx}",
        }),
      ],
  
      // ビルド設定
      build: {
        target: "esnext",
        minify: "terser",
        sourcemap: isProduction ? false : true,
  
        rollupOptions: {
          input: './index.html', // index.htmlを明示的なエントリポイントとして設定
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
        port: 5173,
        host: 'localhost',
        open: true,
        cors: true,
              // HTTPS設定 - mkcert証明書を使用
              https: hasMkcertCerts
                ? {
                    key: fs.readFileSync(keyPath),
                    cert: fs.readFileSync(certPath),
                  }
                : false,
              // HMR (ホットリロード) の設定をHTTPS用に明示
              hmr: {
                protocol: 'wss',
                host: 'localhost',
              },
            },  
      // プレビュー設定
      preview: {
        port: 4173,
        host: "localhost",
        open: true,
        // HTTPS設定 - mkcert証明書を使用
        https: hasMkcertCerts
          ? {
              key: fs.readFileSync(keyPath),
              cert: fs.readFileSync(certPath),
            }
          : false,
      },

    // 定義
    define: {
      '__IS_DEVELOPMENT__': JSON.stringify(isDevelopment),
      '__IS_PRODUCTION__': JSON.stringify(isProduction),
      'process.env.APP_VERSION': JSON.stringify(pkg.version),
    },
    esbuild: {
      // jsxInject: `import React from 'react'`, // 'React'の二重宣言エラーを解決するため削除
    },
  };
});
