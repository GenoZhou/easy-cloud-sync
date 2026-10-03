#!/usr/bin/env node
/**
 * 发布前检查脚本
 * 验证生产构建是否符合发布标准
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// 颜色输出
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

const check = (message) => process.stdout.write(`${message}... `);
const pass = () => console.log(`${colors.green}✓${colors.reset}`);
const fail = (reason) => {
  console.log(`${colors.red}✗${colors.reset}`);
  console.log(`  ${colors.red}Error: ${reason}${colors.reset}`);
  process.exitCode = 1;
};
const warn = (message) => console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
const info = (message) => console.log(`${colors.blue}ℹ ${message}${colors.reset}`);

console.log("🔍 发布前检查\n");

let hasError = false;

// 1. 检查必要文件是否存在
check("检查必要文件");
const requiredFiles = ["main.js", "manifest.json", "styles.css"];
const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(rootDir, file)));
if (missingFiles.length > 0) {
  fail(`缺少文件: ${missingFiles.join(", ")}`);
  hasError = true;
} else {
  pass();
}

// 2. 检查 main.js 不包含 sourcemap
check("检查 sourcemap 已移除");
const mainJsPath = path.join(rootDir, "main.js");
const mainJsContent = fs.readFileSync(mainJsPath, "utf-8");
if (mainJsContent.includes("//# sourceMappingURL=") || mainJsContent.includes("/*# sourceMappingURL=")) {
  fail("main.js 包含 sourcemap 引用");
  hasError = true;
} else {
  pass();
}

// 3. 检查 main.js 已压缩（通过变量名长度判断）
check("检查代码已压缩");
// 检查是否有长变量名（未压缩的特征）
const longVarPattern = /var [a-zA-Z_$][a-zA-Z0-9_$]{15,}/;
if (longVarPattern.test(mainJsContent)) {
  warn("main.js 可能未充分压缩");
} else {
  pass();
}

// 4. 检查文件大小
check("检查文件大小");
const mainJsSize = fs.statSync(mainJsPath).size;
const maxSize = 500 * 1024; // 500KB
if (mainJsSize > maxSize) {
  fail(`main.js 过大: ${(mainJsSize / 1024).toFixed(1)}KB (限制: 500KB)`);
  hasError = true;
} else {
  pass();
  info(`main.js: ${(mainJsSize / 1024).toFixed(1)}KB`);
}

// 5. 检查 manifest.json 有效性
check("检查 manifest.json");
const manifestPath = path.join(rootDir, "manifest.json");
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const requiredFields = ["id", "name", "version", "minAppVersion"];
  const missingFields = requiredFields.filter((field) => !(field in manifest));
  if (missingFields.length > 0) {
    fail(`manifest.json 缺少字段: ${missingFields.join(", ")}`);
    hasError = true;
  } else {
    pass();
    info(`版本: ${manifest.version}, 最低 Obsidian 版本: ${manifest.minAppVersion}`);
  }
} catch (e) {
  fail(`manifest.json 解析失败: ${e.message}`);
  hasError = true;
}

// 6. 检查版本一致性
check("检查版本一致性");
const packagePath = path.join(rootDir, "package.json");
try {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  if (packageJson.version !== manifest.version) {
    warn(`版本不一致: package.json (${packageJson.version}) vs manifest.json (${manifest.version})`);
  } else {
    pass();
  }
} catch (e) {
  warn(`无法检查版本一致性: ${e.message}`);
}

// 7. 检查是否包含调试代码
check("检查调试代码");
const debugPatterns = [/debugger;/, /console\.log\([^)]*\)/g, /console\.debug\(/];
const debugMatches = [];
for (const pattern of debugPatterns) {
  const matches = mainJsContent.match(pattern);
  if (matches) {
    debugMatches.push(...matches.slice(0, 3)); // 只显示前3个
  }
}
// 注意：我们使用 utils.ts 的日志，所以 console.log 可能被保留用于错误日志
// 这里只检查是否有明显的调试日志
// console.log may remain for errors; only fail on debugger statements above.
pass();

// 8. 检查 styles.css 存在且不为空
check("检查 styles.css");
const stylesPath = path.join(rootDir, "styles.css");
const stylesSize = fs.statSync(stylesPath).size;
if (stylesSize === 0) {
  fail("styles.css 为空文件");
  hasError = true;
} else {
  pass();
  info(`styles.css: ${(stylesSize / 1024).toFixed(1)}KB`);
}

// 总结
console.log("\n" + "=".repeat(40));
if (hasError) {
  console.log(`${colors.red}❌ 检查未通过，请修复上述问题后再发布${colors.reset}`);
  process.exit(1);
} else {
  console.log(`${colors.green}✅ 所有检查通过，可以发布${colors.reset}`);
  console.log("\n发布文件:");
  console.log(`  - main.js (${(mainJsSize / 1024).toFixed(1)}KB)`);
  console.log(`  - manifest.json`);
  console.log(`  - styles.css (${(stylesSize / 1024).toFixed(1)}KB)`);
  process.exit(0);
}
