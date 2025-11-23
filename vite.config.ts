import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from './package.json';


export default defineConfig(({ command, mode }) => {
  const isProduction = mode === "production";
  const isDevelopment = mode === "development";

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
    },

    // プレビュー設定
    preview: {
      port: 4173,
      host: "localhost",
      open: true,
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
