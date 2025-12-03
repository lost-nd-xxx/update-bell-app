// scripts/generate-licenses.js
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESモジュールでは__dirnameは使えないので、import.meta.urlから現在のディレクトリパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// license-checker を実行するコマンド
const command = [
  "license-checker",
  "--production", // production dependenciesのみ
  "--excludePrivatePackages", // プライベートパッケージを除外
  "--json", // JSON形式で出力
].join(" ");

console.log("Running license-checker...");
// package.jsonがあるプロジェクトルートでコマンドを実行
exec(command, { cwd: rootDir }, (error, stdout, stderr) => {
  if (error) {
    console.error("Error running license-checker:", stderr);
    process.exit(1);
  }

  console.log("Successfully ran license-checker. Generating markdown...");

  const licenses = JSON.parse(stdout);
  let markdownContent = `# Third-Party Licenses\n\nThis application incorporates open-source software. The following is a list of the open-source software and their licenses.\n\n---\n\n`;

  // ライセンス情報をパッケージ名でソート
  const sortedPackages = Object.keys(licenses).sort();

  for (const packageName of sortedPackages) {
    const licenseInfo = licenses[packageName];

    // licenseTextが空の場合、licenseFileから読み込む
    let licenseText = licenseInfo.licenseText;
    if (
      !licenseText &&
      licenseInfo.licenseFile &&
      fs.existsSync(licenseInfo.licenseFile)
    ) {
      try {
        licenseText = fs.readFileSync(licenseInfo.licenseFile, "utf8");
      } catch (readError) {
        console.warn(
          `Could not read license file for ${packageName}: ${licenseInfo.licenseFile}`,
        );
        licenseText = "Could not read license file.";
      }
    }
    if (!licenseText) {
      licenseText = "License text not found.";
    }

    markdownContent += `## ${packageName}\n\n`;
    markdownContent += `*   **License:** ${licenseInfo.licenses}\n`;
    if (licenseInfo.repository) {
      markdownContent += `*   **Repository:** [${licenseInfo.repository}](${licenseInfo.repository})\n`;
    }
    if (licenseInfo.publisher) {
      markdownContent += `*   **Publisher:** ${licenseInfo.publisher}\n`;
    }
    markdownContent += `\n**License Text:**\n\n`;
    markdownContent += `\`\`\`\n${licenseText.trim()}\n\`\`\`\n`;
    markdownContent += `\n---\n\n`;
  }

  // THIRD-PARTY-LICENSES.mdファイルに書き出す
  const outputPath = path.join(rootDir, "THIRD-PARTY-LICENSES.md");
  fs.writeFileSync(outputPath, markdownContent);

  console.log(
    `✅ THIRD-PARTY-LICENSES.md generated successfully at ${outputPath}`,
  );
});
