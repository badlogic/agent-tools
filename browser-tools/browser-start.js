#!/usr/bin/env node

import { $ } from "bun";
import puppeteer from "puppeteer-core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const useProfile = process.argv[2] === "--profile";

if (process.argv[2] && process.argv[2] !== "--profile") {
	console.log("Usage: browser-start.js [--profile]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Chrome profile (cookies, logins)");
	console.log("\nExamples:");
	console.log("  browser-start.js            # Start with fresh profile");
	console.log("  browser-start.js --profile  # Start with your Chrome profile");
	process.exit(1);
}

const isWindows = process.platform === "win32";

// Kill existing Chrome
try {
	if (isWindows) {
		await $`taskkill /IM chrome.exe /F`.nothrow().quiet();
	} else {
		await $`killall 'Google Chrome'`.nothrow().quiet();
	}
} catch { }

// Wait a bit for processes to fully die
await new Promise((r) => setTimeout(r, 1000));

// Setup profile directory
const homeDir = os.homedir();
const cacheDir = path.join(homeDir, ".cache", "scraping");
await $`mkdir -p ${cacheDir}`.quiet();

if (useProfile) {
	if (isWindows) {
		console.warn("⚠️  Profile syncing is not yet supported on Windows (requires rsync). Starting with fresh profile.");
	} else {
		// Sync profile with rsync (much faster on subsequent runs)
		try {
			await $`rsync -a --delete "${homeDir}/Library/Application Support/Google/Chrome/" ${cacheDir}/`;
		} catch (e) {
			console.error("✗ Failed to sync profile:", e);
		}
	}
}

// Determine Chrome path
let chromePath = "";
if (isWindows) {
	const possiblePaths = [
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
		path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
	];
	for (const p of possiblePaths) {
		if (fs.existsSync(p)) {
			chromePath = p;
			break;
		}
	}
} else {
	chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}

if (!chromePath) {
	console.error("✗ Could not find Google Chrome installation");
	process.exit(1);
}

// Start Chrome in background
const userDataDir = cacheDir;
const args = [
	"--remote-debugging-port=9222",
	`--user-data-dir=${userDataDir}`,
];

// Spawn Chrome detached
const subprocess = Bun.spawn([chromePath, ...args], {
	detached: true,
	stdio: ["ignore", "ignore", "ignore"],
});
subprocess.unref();

// Wait for Chrome to be ready by attempting to connect
let connected = false;
for (let i = 0; i < 30; i++) {
	try {
		const browser = await puppeteer.connect({
			browserURL: "http://localhost:9222",
			defaultViewport: null,
		});
		await browser.disconnect();
		connected = true;
		break;
	} catch {
		await new Promise((r) => setTimeout(r, 500));
	}
}

if (!connected) {
	console.error("✗ Failed to connect to Chrome");
	process.exit(1);
}

console.log(`✓ Chrome started on :9222${useProfile && !isWindows ? " with your profile" : ""}`);
