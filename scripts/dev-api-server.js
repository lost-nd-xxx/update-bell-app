import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

// ミドルウェア
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// APIディレクトリのパス
const apiDir = join(__dirname, "..", "api");

// リクエストログ
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// APIエンドポイントを動的に登録
async function setupApiRoutes() {
  const apiFiles = fs
    .readdirSync(apiDir)
    .filter((file) => file.endsWith(".js") && !file.startsWith("_"));

  for (const file of apiFiles) {
    const routePath = `/api/${file.replace(".js", "")}`;
    const modulePath = join(apiDir, file);

    try {
      // 動的インポート
      const module = await import(`file://${modulePath}`);
      const handler = module.default;

      if (typeof handler !== "function") {
        console.warn(`⚠️  ${file} does not export a default function`);
        continue;
      }

      // すべてのHTTPメソッドに対応
      app.all(routePath, async (req, res) => {
        try {
          // Vercel Request/Response形式をExpressに適合
          const vercelRequest = {
            ...req,
            body: req.body,
            query: req.query,
            cookies: req.cookies,
            headers: req.headers,
            method: req.method,
            url: req.url,
          };

          const vercelResponse = {
            status: (code) => {
              res.status(code);
              return vercelResponse;
            },
            json: (data) => {
              res.json(data);
              return vercelResponse;
            },
            send: (data) => {
              res.send(data);
              return vercelResponse;
            },
            setHeader: (key, value) => {
              res.setHeader(key, value);
              return vercelResponse;
            },
          };

          await handler(vercelRequest, vercelResponse);
        } catch (error) {
          console.error(`Error in ${file}:`, error);
          res.status(500).json({ error: "Internal Server Error" });
        }
      });

      console.log(`✓ Registered: ${routePath}`);
    } catch (error) {
      console.error(`Failed to load ${file}:`, error);
    }
  }
}

// サーバー起動
async function start() {
  await setupApiRoutes();

  app.listen(PORT, () => {
    console.log(`\n🚀 Local API Server running at http://localhost:${PORT}`);
    console.log(
      `📍 API endpoints are available at http://localhost:${PORT}/api/*\n`,
    );
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
