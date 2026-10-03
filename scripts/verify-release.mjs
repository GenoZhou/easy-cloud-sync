#!/usr/bin/env node
/**
 * Verify a tag-push GitHub release after scripts/prerelease.mjs or scripts/release.mjs.
 */

import { spawnSync } from "child_process";

const version = process.argv[2];
const remote = readArg("--remote") || "origin";
const repo = readArg("--repo") || detectRepoSlug(remote) || "GenoZhou/easy-sync";
const workflow = readArg("--workflow") || "Release";
const timeoutMs = readNumberArg("--timeout-ms", 300000);
const intervalMs = readNumberArg("--interval-ms", 5000);

if (!version || version === "--help") {
  console.log(`Usage: node scripts/verify-release.mjs <version> [--repo owner/name] [--remote origin] [--workflow Release] [--timeout-ms 300000] [--interval-ms 5000]`);
  process.exit(version ? 0 : 1);
}

const tagSha = commandOutputStrict("git", ["rev-parse", `refs/tags/${version}`]);
const remoteTagOutput = commandOutputStrict("git", ["ls-remote", "--tags", remote, `refs/tags/${version}`]);
const remoteTagSha = remoteTagOutput.split(/\s+/)[0];
if (remoteTagSha !== tagSha) {
  fail(`Remote tag ${version} points to ${remoteTagSha || "(missing)"}, expected ${tagSha}.`);
}

const headSha = commandOutputStrict("git", ["rev-parse", "HEAD"]);
const localStatus = tagSha === headSha ? "tag matches HEAD" : `tag points to ${tagSha}`;

const release = waitForRelease(version);
if (release.tagName !== version) {
  fail(`GitHub release tag is ${release.tagName}, expected ${version}.`);
}
if (release.isDraft) {
  fail(`GitHub release ${version} is still a draft.`);
}

const run = waitForWorkflowRun(version, tagSha);

console.log(`Release ${version} verified`);
console.log(`- Local tag: ${tagSha} (${localStatus})`);
console.log(`- Remote tag: ${remoteTagSha}`);
console.log(`- GitHub release: ${release.url}`);
console.log(`- Prerelease: ${release.isPrerelease ? "yes" : "no"}`);
console.log(`- Workflow: ${run.databaseId} success (${run.url})`);

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function readNumberArg(name, defaultValue) {
  const value = readArg(name);
  if (value === null) return defaultValue;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`Invalid ${name} "${value}". Expected a positive number.`);
  }
  return parsed;
}

function waitForRelease(targetVersion) {
  return retryUntil(`GitHub release ${targetVersion}`, () => {
    const result = commandOutput("gh", [
      "release",
      "view",
      targetVersion,
      "--repo",
      repo,
      "--json",
      "tagName,isPrerelease,isDraft,url,name",
    ]);

    if (result.status !== 0) {
      return { pending: true, message: shortCommandError(result) };
    }

    const release = JSON.parse(result.stdout);
    if (release.isDraft) {
      return { pending: true, message: `release is still draft: ${release.url}` };
    }

    return { value: release };
  });
}

function waitForWorkflowRun(targetVersion, targetSha) {
  return retryUntil(`${workflow} workflow for ${targetVersion}`, () => {
    const result = commandOutput("gh", [
      "run",
      "list",
      "--repo",
      repo,
      "--workflow",
      workflow,
      "--limit",
      "20",
      "--json",
      "databaseId,headSha,status,conclusion,displayTitle,url,createdAt",
    ]);

    if (result.status !== 0) {
      return { pending: true, message: shortCommandError(result) };
    }

    const runs = JSON.parse(result.stdout);
    const run = runs.find((candidate) => candidate.headSha === targetSha);
    if (!run) {
      return { pending: true, message: `run for ${targetSha} not found yet` };
    }

    if (run.status !== "completed") {
      return { pending: true, message: `run ${run.databaseId} is ${run.status}: ${run.url}` };
    }

    if (run.conclusion !== "success") {
      fail(`Release workflow ${run.databaseId} completed with ${run.conclusion || "unknown"}: ${run.url}`);
    }

    return { value: run };
  });
}

function retryUntil(label, check) {
  const deadline = Date.now() + timeoutMs;
  let lastMessage = "";

  while (Date.now() <= deadline) {
    const result = check();
    if ("value" in result) {
      return result.value;
    }

    lastMessage = result.message;
    console.log(`Waiting for ${label}: ${lastMessage}`);
    sleep(intervalMs);
  }

  fail(`Timed out waiting for ${label}.${lastMessage ? ` Last status: ${lastMessage}` : ""}`);
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function commandOutputStrict(command, args) {
  const result = commandOutput(command, args);
  if (result.status !== 0) {
    fail(`Command failed: ${[command, ...args].join(" ")}\n${shortCommandError(result)}`);
  }
  return result.stdout.trim();
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function shortCommandError(result) {
  return result.stderr || result.stdout || `exited with status ${result.status}`;
}

function detectRepoSlug(remoteName) {
  const result = commandOutput("git", ["remote", "get-url", remoteName]);
  if (result.status !== 0) return null;
  const match = result.stdout.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return match ? match[1] : null;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}
