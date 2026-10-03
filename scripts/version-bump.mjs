#!/usr/bin/env node
/**
 * 版本升级脚本
 * 更新 manifest.json 和 package.json 的版本号
 * 
 * 使用: node scripts/version-bump.mjs [major|minor|patch]
 * 默认: patch
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const bumpType = process.argv[2] || "patch";

if (!["major", "minor", "patch"].includes(bumpType)) {
  console.error("Usage: node version-bump.mjs [major|minor|patch]");
  process.exit(1);
}

// 读取当前版本
const manifestPath = path.join(rootDir, "manifest.json");
const packagePath = path.join(rootDir, "package.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));

const currentVersion = manifest.version;
const [major, minor, patch] = currentVersion.split(".").map(Number);

let newVersion;
switch (bumpType) {
  case "major":
    newVersion = `${major + 1}.0.0`;
    break;
  case "minor":
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case "patch":
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

// 更新版本
manifest.version = newVersion;
packageJson.version = newVersion;

// 写回文件
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t") + "\n");
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, "\t") + "\n");

console.log(`✅ 版本已更新: ${currentVersion} → ${newVersion}`);
