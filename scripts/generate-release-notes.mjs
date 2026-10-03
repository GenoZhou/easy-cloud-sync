#!/usr/bin/env node
/**
 * Generate concise release notes from commits since the previous relevant tag.
 *
 * Stable: commits since the previous stable tag.
 * Prerelease: commits since the previous tag (prerelease or stable) by semver order.
 */

import { spawnSync } from "child_process";
import fs from "fs";

const version = process.argv[2];
const outputPath = readArg("--output");

if (!version || version === "--help") {
  console.log("Usage: node scripts/generate-release-notes.mjs <version> [--output release-notes.md]");
  process.exit(version ? 0 : 1);
}

validateVersion(version);

const previousTag = getPreviousTag(version);
const targetRef = refExists(version) ? version : "HEAD";
const range = previousTag ? `${previousTag}..${targetRef}` : targetRef;
const commits = getCommitSubjects(range)
  .filter((subject) => !/^Release \d+\.\d+\.\d+(?:-.+)?$/.test(subject))
  .map(formatReleaseBullet);

const repoSlug = getRepoSlug();
const body = [
  "## Changes",
  "",
  ...(commits.length > 0 ? commits : ["- 🔧 Maintenance updates"]),
  "",
  previousTag
    ? `**Full Changelog**: https://github.com/${repoSlug}/compare/${previousTag}...${version}`
    : `**Full Changelog**: https://github.com/${repoSlug}/releases/tag/${version}`,
  "",
].join("\n");

if (outputPath) {
  fs.writeFileSync(outputPath, body);
} else {
  process.stdout.write(body);
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function validateVersion(value) {
  if (!parseVersion(value)) {
    fail(`"${value}" is not a semver version such as 1.2.3 or 1.2.3-beta.1.`);
  }
}

function getPreviousTag(targetVersion) {
  const target = parseVersion(targetVersion);
  const tags = listVersionTags().filter((tag) => tag !== targetVersion);

  if (!target.prerelease) {
    return (
      tags
        .filter((tag) => !parseVersion(tag).prerelease)
        .find((tag) => compareSemver(tag, targetVersion) < 0) || null
    );
  }

  return tags.find((tag) => compareSemver(tag, targetVersion) < 0) || null;
}

function listVersionTags() {
  return commandOutputStrict("git", ["tag", "--list", "[0-9]*", "--sort=-version:refname"])
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter((tag) => Boolean(parseVersion(tag)))
    .sort((left, right) => compareSemver(right, left));
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || null,
  };
}

function compareSemver(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    fail(`Cannot compare versions "${left}" and "${right}".`);
  }

  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }

  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return comparePrereleaseIds(a.prerelease, b.prerelease);
}

function comparePrereleaseIds(left, right) {
  const a = left.split(".");
  const b = right.split(".");
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;

    const aNum = /^\d+$/.test(a[i]);
    const bNum = /^\d+$/.test(b[i]);
    if (aNum && bNum) {
      const diff = Number(a[i]) - Number(b[i]);
      if (diff !== 0) return diff;
      continue;
    }
    if (aNum !== bNum) return aNum ? -1 : 1;
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }

  return 0;
}

function getCommitSubjects(range) {
  const output = commandOutputStrict("git", ["log", "--format=%s", "--no-merges", range]);
  if (!output) return [];
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
}

function refExists(ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], {
    encoding: "utf-8",
  });
  return result.status === 0;
}

function formatReleaseBullet(subject) {
  const cleanSubject = stripConventionalPrefix(subject);
  return `- ${pickEmoji(cleanSubject)} ${cleanSubject}`;
}

function stripConventionalPrefix(subject) {
  return subject
    .replace(/^(feat|fix|docs|test|tests|refactor|chore|build|ci|perf)(\([^)]+\))?!?:\s*/i, "")
    .replace(/\.$/, "");
}

function pickEmoji(subject) {
  const text = subject.toLowerCase();
  if (/(fix|bug|correct|prevent|avoid|fallback|missing|skip|error|fail)/.test(text)) return "🐛";
  if (/(test|coverage|verify|check|guard|harden|safe|release)/.test(text)) return "✅";
  if (/(doc|readme|instruction|guide)/.test(text)) return "📚";
  if (/(style|ui|setting|modal|view|button)/.test(text)) return "🎨";
  if (/(add|enable|support|introduce|new)/.test(text)) return "✨";
  return "🔧";
}

function getRepoSlug() {
  const remote = commandOutput("git", ["remote", "get-url", "origin"]);
  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return match ? match[1] : "GenoZhou/easy-recall";
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
  });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function commandOutputStrict(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    const details = result.stderr?.trim() || result.stdout?.trim() || `${command} exited with status ${result.status}`;
    fail(`Command failed: ${[command, ...args].join(" ")}\n${details}`);
  }
  return result.stdout.trim();
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}
