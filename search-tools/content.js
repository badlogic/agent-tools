#!/usr/bin/env node

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getChromePath, getChromeProfilePath } from "./platform.js";
import { syncDirectory } from "./sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

puppeteer.use(StealthPlugin());

// Profile paths
const CHROME_PROFILE = getChromeProfilePath();
const CACHE_PROFILE = path.join(__dirname, ".headless-profile");

const TIMEOUT = 30000;
setTimeout(() => {
	console.error("✗ Timeout after 30s");
	process.exit(1);
}, TIMEOUT).unref();

const args = process.argv.slice(2);

// --sync flag to force profile sync
const syncIndex = args.indexOf("--sync");
const forceSync = syncIndex !== -1;
if (forceSync) args.splice(syncIndex, 1);

const url = args[0];

if (!url) {
	console.log("Usage: content.js <url> [--sync]");
	console.log("\nExtracts readable content from a URL as markdown (headless, uses your Chrome profile).");
	console.log("\nOptions:");
	console.log("  --sync   Force re-sync of Chrome profile");
	console.log("\nExamples:");
	console.log("  content.js https://example.com");
	console.log("  content.js https://example.com --sync");
	process.exit(1);
}

// Sync Chrome profile if needed
const profileExists = fs.existsSync(CACHE_PROFILE);
if (!profileExists || forceSync) {
	console.error("Syncing Chrome profile...");
	try {
		if (!CHROME_PROFILE || !fs.existsSync(CHROME_PROFILE)) {
			throw new Error("Chrome profile not found");
		}

		const excludePatterns = [
			"SingletonLock",
			"SingletonSocket",
			"SingletonCookie",
			".lock",
			"lockfile",
			"Lock",
			"BrowserMetrics",
			"Crashpad",
			"Cache",
			"Code Cache",
			"GPUCache",
			"GrShaderCache",
			"ShaderCache",
			"Service Worker",
			".tmp",
		];

		await syncDirectory(CHROME_PROFILE, CACHE_PROFILE, { exclude: excludePatterns });
		console.error("Profile synced.");
	} catch (e) {
		console.error("Warning: Could not sync profile:", e.message);
	}
}

const chromePath = getChromePath();
if (!chromePath) {
	console.error("✗ Chrome not found. Please install Google Chrome.");
	process.exit(1);
}

const browser = await puppeteer.launch({
	headless: "new",
	executablePath: chromePath,
	userDataDir: CACHE_PROFILE,
	args: [
		"--no-sandbox",
		"--disable-setuid-sandbox",
		"--disable-blink-features=AutomationControlled",
		"--window-size=1920,1080",
		"--no-first-run",
		"--no-default-browser-check",
	],
	ignoreDefaultArgs: ["--enable-automation"],
});

const p = await browser.newPage();
await p.setViewport({ width: 1920, height: 1080 });

await p.evaluateOnNewDocument(() => {
	Object.defineProperty(navigator, "webdriver", { get: () => undefined });
});

await Promise.race([
	p.goto(url, { waitUntil: "networkidle2" }),
	new Promise((r) => setTimeout(r, 15000)),
]).catch(() => {});

// Get HTML via CDP
const client = await p.createCDPSession();
const { root } = await client.send("DOM.getDocument", { depth: -1, pierce: true });
const { outerHTML } = await client.send("DOM.getOuterHTML", { nodeId: root.nodeId });
await client.detach();

const finalUrl = p.url();

// Extract with Readability
const doc = new JSDOM(outerHTML, { url: finalUrl });
const reader = new Readability(doc.window.document);
const article = reader.parse();

function htmlToMarkdown(html) {
	const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
	turndown.use(gfm);
	turndown.addRule("removeEmptyLinks", {
		filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
		replacement: () => "",
	});
	return turndown
		.turndown(html)
		.replace(/\[\\?\[\s*\\?\]\]\([^)]*\)/g, "")
		.replace(/ +/g, " ")
		.replace(/\s+,/g, ",")
		.replace(/\s+\./g, ".")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

let content;
if (article && article.content) {
	content = htmlToMarkdown(article.content);
} else {
	const fallbackDoc = new JSDOM(outerHTML, { url: finalUrl });
	const fallbackBody = fallbackDoc.window.document;
	fallbackBody.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((el) => el.remove());
	const main = fallbackBody.querySelector("main, article, [role='main'], .content, #content") || fallbackBody.body;
	const fallbackHtml = main?.innerHTML || "";
	if (fallbackHtml.trim().length > 100) {
		content = htmlToMarkdown(fallbackHtml);
	} else {
		content = "(Could not extract content)";
	}
}

console.log(`URL: ${finalUrl}`);
if (article?.title) console.log(`Title: ${article.title}`);
console.log("");
console.log(content);

await browser.close();
process.exit(0);
