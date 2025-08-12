// scripts/convert-icons.js
// SVGアイコンからPWA用PNGアイコンを自動生成

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESModuleで__dirnameを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 必要なPNGサイズ（PWA用）
const iconSizes = [
  16, 32, 72, 96, 128, 144, 152, 180, 192, 384, 512
];

// SVGファイルパス（_workspaceフォルダ内）
const svgFiles = {
  // 大きいサイズ用（文字入り、256px以上）
  large: '_workspace/icon-large.svg',
  // 中サイズ用（文字なし標準、96-256px）
  medium: '_workspace/icon-medium.svg',
  // 小さいサイズ用（シンプル化、32-96px）
  small: '_workspace/icon-small.svg',
  // 極小サイズ用（最もシンプル、32px以下）
  tiny: '_workspace/icon-tiny.svg',
  // マスク用（モノクロ、透明背景）
  mask: '_workspace/icon-mask.svg'
};

// 出力ディレクトリ
const outputDir = 'public';

// ログ出力
const log = (message) => {
  console.log(`🎨 ${message}`);
};

// SVGファイルの存在確認
const checkSvgFiles = () => {
  log('SVGファイルの存在確認...');
  const missingFiles = [];
  
  for (const [key, filePath] of Object.entries(svgFiles)) {
    if (!fs.existsSync(filePath)) {
      missingFiles.push(`${key}: ${filePath}`);
    } else {
      log(`✅ ${key}: ${filePath}`);
    }
  }
  
  if (missingFiles.length > 0) {
    console.error('❌ 以下のSVGファイルが見つかりません:');
    missingFiles.forEach(file => console.error(`   ${file}`));
    process.exit(1);
  }
  
  log('✅ 全SVGファイル確認完了');
};

// サイズに応じた最適なSVGファイルを選択
const selectSvgFile = (size) => {
  if (size >= 256) return svgFiles.large;    // 256px以上: 文字入り
  if (size >= 96) return svgFiles.medium;    // 96-256px: 文字なし標準
  if (size >= 32) return svgFiles.small;     // 32-96px: シンプル化
  return svgFiles.tiny;                      // 32px未満: 極小用
};

// PNGアイコンを生成
const generateIcon = async (size) => {
  const svgPath = selectSvgFile(size);
  const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);
  
  try {
    log(`🔄 生成中: ${size}x${size}px (元: ${path.basename(svgPath)})`);
    
    await sharp(svgPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 } // 透明背景（SVG背景を保持）
      })
      .png({
        quality: 100,
        compressionLevel: 9,
        palette: false // フルカラー（RGB、アルファなし）
      })
      .toFile(outputPath);
    
    // ファイルサイズを確認
    const stats = fs.statSync(outputPath);
    const fileSizeKB = Math.round(stats.size / 1024);
    
    log(`✅ 完了: icon-${size}x${size}.png (${fileSizeKB}KB)`);
    
  } catch (error) {
    console.error(`❌ エラー: ${size}x${size}px生成失敗`);
    console.error(error.message);
    throw error;
  }
};

// マスクアイコンを生成（Safari用）
const generateMaskIcon = async () => {
  const outputPath = path.join(outputDir, 'icon-mask.svg');
  
  try {
    log('🔄 マスクアイコンをコピー中...');
    
    // モノクロSVGをそのままコピー
    fs.copyFileSync(svgFiles.mask, outputPath);
    
    log('✅ 完了: icon-mask.svg');
    
  } catch (error) {
    console.error('❌ エラー: マスクアイコン生成失敗');
    console.error(error.message);
    throw error;
  }
};

// ファビコンを生成（PNG版 - 現代ブラウザ対応）
const generateFavicon = async () => {
  try {
    log('🔄 ファビコン準備中...');
    
    // 32x32と16x16のPNGファビコンをコピー
    const favicon32 = path.join(outputDir, 'icon-32x32.png');
    const favicon16 = path.join(outputDir, 'icon-16x16.png');
    const faviconOut = path.join(outputDir, 'favicon.png');
    
    // 32x32をfavicon.pngとしてコピー
    fs.copyFileSync(favicon32, faviconOut);
    
    log('✅ 完了: favicon.png (32x32 PNG形式)');
    log('ℹ️  現代ブラウザはPNGファビコンに対応しています');
    
  } catch (error) {
    console.error('❌ エラー: ファビコン生成失敗');
    console.error(error.message);
    // ファビコンは必須ではないので、エラーでも続行
  }
};

// メイン処理
const main = async () => {
  try {
    log('=== おしらせベル アイコン変換開始 ===');
    
    // SVGファイル確認
    checkSvgFiles();
    
    // 出力ディレクトリ確認
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      log(`📁 出力ディレクトリ作成: ${outputDir}`);
    }
    
    // 全サイズのPNGアイコンを順次生成
    log(`🎯 ${iconSizes.length}種類のPNGアイコンを生成...`);
    for (const size of iconSizes) {
      await generateIcon(size);
    }
    
    // マスクアイコン生成
    await generateMaskIcon();
    
    // ファビコン生成
    await generateFavicon();
    
    log('=== 🎉 アイコン変換完了！ ===');
    log(`📊 生成ファイル数: ${iconSizes.length + 2}個`);
    log('📁 出力先: public/icon-*x*.png, public/icon-mask.svg, public/favicon.png');
    
  } catch (error) {
    console.error('\n❌ アイコン変換でエラーが発生しました:');
    console.error(error.message);
    process.exit(1);
  }
};

// スクリプト実行
main();