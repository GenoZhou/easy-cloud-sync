#!/usr/bin/env node
/**
 * Prepare or publish a prerelease tag.
 *
 * Examples:
 *   node scripts/prerelease.mjs
 *   node scripts/prerelease.mjs --version 1.2.3-beta.2
 *   node scripts/prerelease.mjs --base minor --preid beta
 *   node scripts/prerelease.mjs --publish
 *
 * GitHub Releases are created by .github/workflows/release.yml after the tag is pushed.
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function hasFlag(name) {
  return args.includes(name);
}

function usage() {
  console.log(`Usage: node scripts/prerelease.mjs [options]

Options:
  --version <version>   Use an explicit prerelease version, e.g. 1.2.3-beta.2
  --base <type>         Base bump when starting a new prerelease: major, minor, patch
  --preid <id>          Prerelease identifier, default: beta
  --publish             Commit, tag, and push. GitHub Actions creates the prerelease.
  --remote <name>       Git remote to inspect and push, default: origin
  --help                Show this help

Default behavior:
  - The next prerelease number is chosen from local and remote tags.
  - If current version is 1.2.2 and origin has 1.2.3-beta.3, next is 1.2.3-beta.4.
  - Without --publish, only files are updated and npm run prepublishOnly is executed.
  - With --publish, the script re-checks that the tag does not exist before pushing.
`);
}

if (hasFlag("--help")) {
  usage();
  process.exit(0);
}

const explicitVersion = readArg("--version");
const explicitBase = readArg("--base");
const preid = readArg("--preid") || "beta";
const shouldPublish = hasFlag("--publish");
const remoteName = readArg("--remote") || "origin";
const expectedGitAuthor = {
  name: "Geno",
  email: "6045730+GenoZhou@users.noreply.github.com",
};

const files = {
  manifest: path.join(rootDir, "manifest.json"),
  packageJson: path.join(rootDir, "package.json"),
  packageLock: path.join(rootDir, "package-lock.json"),
  readmeEn: path.join(rootDir, "README.md"),
  readmeZh: path.join(rootDir, "README.zh.md"),
};

if (explicitBase && !["major", "minor", "patch"].includes(explicitBase)) {
  fail(`Invalid --base "${explicitBase}". Expected major, minor, or patch.`);
}

await main();

async function main() {
  const manifest = readJson(files.manifest);
  const packageJson = readJson(files.packageJson);

  if (manifest.version !== packageJson.version) {
    fail(`Version mismatch: manifest.json (${manifest.version}) vs package.json (${packageJson.version})`);
  }

  const currentVersion = manifest.version;
  const nextVersion = explicitVersion || getNextPrereleaseVersion(currentVersion, preid, explicitBase);
  validatePrereleaseVersion(nextVersion);
  ensureVersionAvailable(nextVersion);
  if (shouldPublish) {
    ensureReleaseGitIdentity();
    ensureCleanWorkingTree();
  }

  updateVersions(manifest, packageJson, nextVersion);
  run("npm", ["run", "prepublishOnly"]);

  console.log(`\nPrepared prerelease ${nextVersion}`);

  if (shouldPublish) {
    await publish(nextVersion);
  }
}

function getNextPrereleaseVersion(version, id, baseType) {
  const parsed = parseVersion(version);
  const base = getPrereleaseBase(parsed, baseType);
  const localMax = getMaxPrereleaseTagNumber(
    commandOutput("git", ["tag", "--list", `${base.major}.${base.minor}.${base.patch}-${id}.*`]),
    base,
    id
  );
  const remoteMax = getMaxPrereleaseTagNumber(
    remoteTagOutput(`${base.major}.${base.minor}.${base.patch}-${id}.*`),
    base,
    id
  );
  const nextNumber = Math.max(localMax, remoteMax) + 1;

  return `${base.major}.${base.minor}.${base.patch}-${id}.${nextNumber}`;
}

function getPrereleaseBase(version, baseType) {
  if (!baseType && version.prerelease) {
    return { major: version.major, minor: version.minor, patch: version.patch };
  }
  return bumpBase(version, baseType || "patch");
}

function getMaxPrereleaseTagNumber(tagOutput, base, id) {
  if (!tagOutput) return 0;

  const tagPattern = new RegExp(
    `(?:refs/tags/)?${base.major}\\.${base.minor}\\.${base.patch}-${escapeRegExp(id)}\\.(\\d+)$`
  );
  return tagOutput
    .split(/\r?\n/)
    .map((line) => line.trim().match(tagPattern)?.[1])
    .filter(Boolean)
    .map(Number)
    .reduce((max, value) => Math.max(max, value), 0);
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    fail(`Invalid version "${version}". Expected semver such as 1.2.3 or 1.2.3-beta.1.`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || null,
  };
}

function bumpBase(version, type) {
  switch (type) {
    case "major":
      return { major: version.major + 1, minor: 0, patch: 0 };
    case "minor":
      return { major: version.major, minor: version.minor + 1, patch: 0 };
    case "patch":
    default:
      return { major: version.major, minor: version.minor, patch: version.patch + 1 };
  }
}

function validatePrereleaseVersion(version) {
  const parsed = parseVersion(version);
  if (!parsed.prerelease) {
    fail(`"${version}" is not a prerelease version. Include a suffix such as -beta.1.`);
  }
}

function ensureVersionAvailable(version) {
  if (commandOutput("git", ["tag", "--list", version])) {
    fail(`Local tag ${version} already exists.`);
  }

  if (remoteTagOutput(version)) {
    fail(`Remote tag ${version} already exists on ${remoteName}.`);
  }

}

function ensureReleaseGitIdentity() {
  const currentName = commandOutput("git", ["config", "user.name"]);
  const currentEmail = commandOutput("git", ["config", "user.email"]);

  if (currentName === expectedGitAuthor.name && currentEmail === expectedGitAuthor.email) {
    return;
  }

  run("git", ["config", "user.name", expectedGitAuthor.name]);
  run("git", ["config", "user.email", expectedGitAuthor.email]);

  const nextName = commandOutput("git", ["config", "user.name"]);
  const nextEmail = commandOutput("git", ["config", "user.email"]);
  if (nextName !== expectedGitAuthor.name || nextEmail !== expectedGitAuthor.email) {
    fail(`Git author is ${nextName} <${nextEmail}>. Expected ${expectedGitAuthor.name} <${expectedGitAuthor.email}>.`);
  }

  console.log(`Configured release git author: ${nextName} <${nextEmail}>`);
}

function ensureCleanWorkingTree() {
  const status = commandOutput("git", ["status", "--short"]);
  if (!status) {
    return;
  }

  fail([
    "Working tree has changes before release version files are generated.",
    "Commit or stash these changes first so the release commit only contains generated release files.",
    status,
  ].join("\n"));
}

function updateVersions(manifest, packageJson, version) {
  manifest.version = version;
  packageJson.version = version;
  writeJson(files.manifest, manifest);
  writeJson(files.packageJson, packageJson);

  if (fs.existsSync(files.packageLock)) {
    const packageLock = readJson(files.packageLock);
    packageLock.version = version;
    if (packageLock.packages?.[""]) {
      packageLock.packages[""].version = version;
    }
    writeJson(files.packageLock, packageLock);
  }

  const versionsPath = path.join(rootDir, "versions.json");
  if (fs.existsSync(versionsPath)) {
    const versions = readJson(versionsPath);
    versions[version] = manifest.minAppVersion;
    writeJson(versionsPath, versions);
  }

  updateReadmeBadge(files.readmeEn, version);
  updateReadmeBadge(files.readmeZh, version);
}

function updateReadmeBadge(filePath, version) {
  if (!fs.existsSync(filePath)) return;
  const badgeVersion = version.replace(/-/g, "--");
  const badge = `![Version](https://img.shields.io/badge/version-${badgeVersion}-blue)`;
  const content = fs.readFileSync(filePath, "utf-8");
  const next = content.replace(
    /!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-[^)]+-blue\)/,
    badge
  );
  fs.writeFileSync(filePath, next);
}

async function publish(version) {
  const branch = commandOutput("git", ["branch", "--show-current"]);
  if (!branch) {
    fail("Could not determine current git branch.");
  }

  run("git", ["add", "-A"]);
  const staged = commandOutput("git", ["diff", "--cached", "--name-only"]);
  if (staged) {
    run("git", ["commit", "-m", `Release ${version}`]);
  } else {
    console.log("No staged changes to commit.");
  }

  ensureVersionAvailable(version);
  printPublishSummary(version, branch);

  run("git", ["tag", version]);
  run("git", ["push", remoteName, branch, version]);
}

function printPublishSummary(version, branch) {
  console.log(`\nReady to publish prerelease ${version}`);
  console.log(`Remote: ${remoteName}`);
  console.log(`Branch: ${branch}`);
  console.log("This will push the branch and tag. GitHub Actions will create the prerelease.");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, "\t") + "\n");
}

function commandOutput(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function remoteTagOutput(pattern) {
  return commandOutputStrict("git", ["ls-remote", "--tags", remoteName, `refs/tags/${pattern}`]);
}

function commandOutputStrict(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    const details = result.stderr?.trim() || result.stdout?.trim() || `${command} exited with status ${result.status}`;
    fail(`Command failed: ${[command, ...commandArgs].join(" ")}\n${details}`);
  }
  return result.stdout.trim();
}

function run(command, commandArgs) {
  console.log(`\n$ ${[command, ...commandArgs].join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}
