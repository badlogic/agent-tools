#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import { getChromePath, getChromeProfilePath, getCacheDir } from "./platform.js";
import { syncDirectory } from "./sync.js";

const useProfile = process.argv[2] === "--profile";

if (process.argv[2] && process.argv[2] !== "--profile") {
	console.log("Usage: browser-start.js [--profile]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Chrome profile (cookies, logins)");
	process.exit(1);
}

const SCRAPING_DIR = getCacheDir("browser-tools");

// Check if already running on :9222
try {
	const browser = await puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	});
	await browser.disconnect();
	console.log("✓ Chrome already running on :9222");
	process.exit(0);
} catch {}

// Setup profile directory
fs.mkdirSync(SCRAPING_DIR, { recursive: true });

// Remove SingletonLock to allow new instance
const singletonFiles = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
for (const file of singletonFiles) {
	try {
		fs.rmSync(path.join(SCRAPING_DIR, file), { force: true });
	} catch {}
}

if (useProfile) {
	console.log("Syncing profile...");
	const sourceProfile = getChromeProfilePath();
	if (!sourceProfile || !fs.existsSync(sourceProfile)) {
		console.error("✗ Chrome profile not found");
		process.exit(1);
	}

	const excludePatterns = [
		"SingletonLock",
		"SingletonSocket",
		"SingletonCookie",
		"Sessions",
		"Current Session",
		"Current Tabs",
		"Last Session",
		"Last Tabs",
	];

	try {
		await syncDirectory(sourceProfile, SCRAPING_DIR, { exclude: excludePatterns });
	} catch (e) {
		console.error("✗ Failed to sync profile:", e.message);
		process.exit(1);
	}
}

// Start Chrome with flags to force new instance
const chromePath = getChromePath();
if (!chromePath) {
	console.error("✗ Chrome not found. Please install Google Chrome.");
	process.exit(1);
}

spawn(chromePath, ["--remote-debugging-port=9222", `--user-data-dir=${SCRAPING_DIR}`, "--no-first-run", "--no-default-browser-check"], {
	detached: true,
	stdio: "ignore",
}).unref();

// Wait for Chrome to be ready
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

console.log(`✓ Chrome started on :9222${useProfile ? " with your profile" : ""}`);
