// scripts/generate-licenses.js
// 各プロジェクトで生成されたlicenses.jsonを統合し、THIRD-PARTY-LICENSES.mdを生成する

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESモジュールでは__dirnameは使えないので、import.meta.urlから現在のディレクトリパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 各プロジェクトのルートディレクトリを定義
const projectRoots = {
  "update-bell-app": path.resolve(__dirname, ".."),
  "update-bell-app-cron": path.resolve(__dirname, "../../update-bell-app-cron"),
  "update-bell-app-notification-sender": path.resolve(__dirname, "../../update-bell-app-notification-sender"),
};

// Markdownを生成するメイン関数
function generateLicenses() {
  let markdownContent = `# Third-Party Licenses\n\nThis application incorporates open-source software. The following is a list of the open-source software and their licenses.\n\n---\n\n`;

  const allLicenses = {};

  // 各プロジェクトのlicenses.jsonを読み込む
  for (const [projectName, rootPath] of Object.entries(projectRoots)) {
    const licensesPath = path.join(rootPath, 'licenses.json');
    if (fs.existsSync(licensesPath)) {
      try {
        const licenses = JSON.parse(fs.readFileSync(licensesPath, 'utf8'));
        Object.assign(allLicenses, licenses);
      } catch (error) {
        console.error(`Error reading or parsing licenses.json for ${projectName}:`, error);
      }
    } else {
      console.warn(`licenses.json not found for ${projectName}`);
    }
  }
  
  // ライセンス情報をパッケージ名でソート
  const sortedPackages = Object.keys(allLicenses).sort();

  for (const packageName of sortedPackages) {
    const licenseInfo = allLicenses[packageName];
    markdownContent += `## ${packageName}\n\n`;
    markdownContent += `*   **License:** ${licenseInfo.licenses}\n`;
    markdownContent += `*   **Repository:** [${licenseInfo.repository}](${licenseInfo.repository})\n`;
    markdownContent += `*   **Publisher:** ${licenseInfo.publisher}\n`;
    markdownContent += `*   **License File:** 
${licenseInfo.licenseText}
`;
    markdownContent += `
---\n\n`;
  }

  // THIRD-PARTY-LICENSES.mdファイルに書き出す
  fs.writeFileSync(path.resolve(__dirname, "../THIRD-PARTY-LICENSES.md"), markdownContent);

  console.log("✅ THIRD-PARTY-LICENSES.md generated successfully.");
}

generateLicenses();
