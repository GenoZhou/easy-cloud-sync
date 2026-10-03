#!/usr/bin/env node
/**
 * Prepare or publish a stable release tag.
 *
 * Examples:
 *   node scripts/release.mjs
 *   node scripts/release.mjs --version 1.2.7
 *   node scripts/release.mjs --bump minor
 *   node scripts/release.mjs --publish
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
  console.log(`Usage: node scripts/release.mjs [options]

Options:
  --version <version>   Use an explicit stable version, e.g. 1.2.7
  --bump <type>         Bump from current stable version: major, minor, patch
  --publish             Commit, tag, and push. GitHub Actions creates the release.
  --remote <name>       Git remote to inspect and push, default: origin
  --help                Show this help

Default behavior:
  - If the current version is a prerelease, the stable base is used, e.g. 1.2.7-beta.3 -> 1.2.7.
  - If the current version is stable, patch is bumped, e.g. 1.2.7 -> 1.2.8.
  - Without --publish, only files are updated and npm run prepublishOnly is executed.
`);
}

if (hasFlag("--help")) {
  usage();
  process.exit(0);
}

const explicitVersion = readArg("--version");
const bumpType = readArg("--bump");
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

if (bumpType && !["major", "minor", "patch"].includes(bumpType)) {
  fail(`Invalid --bump "${bumpType}". Expected major, minor, or patch.`);
}

main();

function main() {
  const manifest = readJson(files.manifest);
  const packageJson = readJson(files.packageJson);

  if (manifest.version !== packageJson.version) {
    fail(`Version mismatch: manifest.json (${manifest.version}) vs package.json (${packageJson.version})`);
  }

  const nextVersion = explicitVersion || getNextStableVersion(manifest.version, bumpType);
  validateStableVersion(nextVersion);
  ensureVersionAvailable(nextVersion);
  if (shouldPublish) {
    ensureReleaseGitIdentity();
    ensureCleanWorkingTree();
  }

  updateVersions(manifest, packageJson, nextVersion);
  run("npm", ["run", "prepublishOnly"]);

  console.log(`\nPrepared release ${nextVersion}`);

  if (shouldPublish) {
    publish(nextVersion);
  }
}

function getNextStableVersion(version, type) {
  const parsed = parseVersion(version);
  if (!type && parsed.prerelease) {
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  }

  const bumped = bumpBase(parsed, type || "patch");
  return `${bumped.major}.${bumped.minor}.${bumped.patch}`;
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

function validateStableVersion(version) {
  const parsed = parseVersion(version);
  if (parsed.prerelease) {
    fail(`"${version}" is not a stable version. Use scripts/prerelease.mjs for prereleases.`);
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

  const versionsPath = path.join(rootDir, "versions.json");
  if (fs.existsSync(versionsPath)) {
    const versions = readJson(versionsPath);
    versions[version] = manifest.minAppVersion;
    writeJson(versionsPath, versions);
  }

  if (fs.existsSync(files.packageLock)) {
    const packageLock = readJson(files.packageLock);
    packageLock.version = version;
    if (packageLock.packages?.[""]) {
      packageLock.packages[""].version = version;
    }
    writeJson(files.packageLock, packageLock);
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

function publish(version) {
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
  console.log(`\nReady to publish release ${version}`);
  console.log(`Remote: ${remoteName}`);
  console.log(`Branch: ${branch}`);
  console.log("This will push the branch and tag. GitHub Actions will create the release.");

  run("git", ["tag", version]);
  run("git", ["push", remoteName, branch, version]);
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

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}
