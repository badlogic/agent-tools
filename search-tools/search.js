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
import { getChromePath, getChromeProfilePath } from "../utils/platform.js";
import { syncDirectory } from "../utils/sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

puppeteer.use(StealthPlugin());

// Profile paths
const CHROME_PROFILE = getChromeProfilePath();
const CACHE_PROFILE = path.join(__dirname, ".headless-profile");

setTimeout(() => {
	console.error("✗ Timeout after 90s");
	process.exit(1);
}, 90000).unref();

const args = process.argv.slice(2);

// --setup flag for headed mode to solve CAPTCHA
const setupIndex = args.indexOf("--setup");
const forceSetup = setupIndex !== -1;
if (forceSetup) args.splice(setupIndex, 1);

// --sync flag to force profile sync
const syncIndex = args.indexOf("--sync");
const forceSync = syncIndex !== -1;
if (forceSync) args.splice(syncIndex, 1);

const contentIndex = args.indexOf("--content");
const fetchContent = contentIndex !== -1;
if (fetchContent) args.splice(contentIndex, 1);

let numResults = 5;
const nIndex = args.indexOf("-n");
if (nIndex !== -1 && args[nIndex + 1]) {
	numResults = parseInt(args[nIndex + 1], 10);
	args.splice(nIndex, 2);
}

const query = args.join(" ");

if (!query) {
	console.log("Usage: search.js <query> [-n <num>] [--content] [--setup] [--sync]");
	console.log("\nOptions:");
	console.log("  -n <num>    Number of results (default: 5)");
	console.log("  --content   Fetch readable content as markdown");
	console.log("  --setup     Force headed mode to solve CAPTCHA");
	console.log("  --sync      Force re-sync of Chrome profile");
	console.log("\nExamples:");
	console.log('  search.js "javascript async await"');
	console.log('  search.js "rust programming" -n 10');
	console.log('  search.js "climate change" --setup  # Solve CAPTCHA if needed');
	process.exit(1);
}

// Sync Chrome profile if needed (first run or --sync flag)
const profileExists = fs.existsSync(CACHE_PROFILE);
if (!profileExists || forceSync) {
	console.error("Syncing Chrome profile (this may take a moment on first run)...");
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
		console.error("Continuing with existing profile or fresh start...");
	}
}

// Decide headless vs headed
const runHeaded = forceSetup;

const chromePath = getChromePath();
if (!chromePath) {
	console.error("✗ Chrome not found. Please install Google Chrome.");
	process.exit(1);
}

const browser = await puppeteer.launch({
	headless: runHeaded ? false : "new",
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

async function extractResults() {
	return p.evaluate(() => {
		const items = [];
		const searchResults = document.querySelectorAll("div.MjjYud");
		for (const result of searchResults) {
			const titleEl = result.querySelector("h3");
			const linkEl = result.querySelector("a");
			const snippetEl = result.querySelector("div.VwiC3b, div[data-sncf]");
			if (titleEl && linkEl && linkEl.href && !linkEl.href.startsWith("https://www.google.com")) {
				items.push({
					title: titleEl.textContent?.trim() || "",
					link: linkEl.href,
					snippet: snippetEl?.textContent?.trim() || "",
				});
			}
		}
		return items;
	});
}

async function waitForCaptchaSolved(page, timeout = 120000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const url = page.url();
		if (!url.includes("/sorry/") && !url.includes("captcha")) {
			return true;
		}
		await new Promise(r => setTimeout(r, 500));
	}
	return false;
}

const results = [];
let start = 0;

await p.goto("https://www.google.com", { waitUntil: "networkidle2" });
await new Promise(r => setTimeout(r, 300 + Math.random() * 300));

while (results.length < numResults) {
	const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${start}`;
	await p.goto(searchUrl, { waitUntil: "domcontentloaded" });
	
	const url = p.url();
	if (url.includes("/sorry/") || url.includes("captcha")) {
		if (runHeaded) {
			console.error("CAPTCHA detected. Please solve it in the browser window...");
			const solved = await waitForCaptchaSolved(p);
			if (solved) {
				console.error("CAPTCHA solved! Session saved.");
				await p.goto(searchUrl, { waitUntil: "domcontentloaded" });
			} else {
				console.error("Timeout waiting for CAPTCHA.");
				await browser.close();
				process.exit(1);
			}
		} else {
			console.error("CAPTCHA detected in headless mode.");
			console.error("Run with --setup to solve CAPTCHA:");
			console.error(`  search.js "${query}" --setup`);
			await browser.close();
			process.exit(1);
		}
	}
	
	await p.waitForSelector("div.MjjYud", { timeout: 10000 }).catch(() => {});

	const pageResults = await extractResults();
	if (pageResults.length === 0) break;

	for (const r of pageResults) {
		if (results.length >= numResults) break;
		if (!results.some((existing) => existing.link === r.link)) {
			results.push(r);
		}
	}

	start += 10;
	if (start >= 100) break;
}

if (results.length === 0) {
	console.error("No results found.");
	console.error("URL:", p.url());
	await browser.close();
	process.exit(0);
}

async function getHtmlViaCDP(page) {
	const client = await page.createCDPSession();
	try {
		const { root } = await client.send("DOM.getDocument", { depth: -1, pierce: true });
		const { outerHTML } = await client.send("DOM.getOuterHTML", { nodeId: root.nodeId });
		return outerHTML;
	} finally {
		await client.detach();
	}
}

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

if (fetchContent) {
	for (const result of results) {
		try {
			await Promise.race([
				p.goto(result.link, { waitUntil: "networkidle2" }),
				new Promise((r) => setTimeout(r, 10000)),
			]).catch(() => {});

			const html = await getHtmlViaCDP(p);
			const url = p.url();
			const doc = new JSDOM(html, { url });
			const reader = new Readability(doc.window.document);
			const article = reader.parse();

			if (article && article.content) {
				result.content = htmlToMarkdown(article.content).substring(0, 5000);
			} else {
				const fallbackDoc = new JSDOM(html, { url });
				const fallbackBody = fallbackDoc.window.document;
				fallbackBody.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((el) => el.remove());
				const main = fallbackBody.querySelector("main, article, [role='main'], .content, #content") || fallbackBody.body;
				const fallbackText = main?.textContent || "";
				if (fallbackText.trim().length > 100) {
					result.content = htmlToMarkdown(`<div>${fallbackText}</div>`).substring(0, 5000);
				} else {
					result.content = "(Could not extract content)";
				}
			}
		} catch (e) {
			result.content = `(Error fetching: ${e.message})`;
		}
	}
}

for (let i = 0; i < results.length; i++) {
	const r = results[i];
	console.log(`--- Result ${i + 1} ---`);
	console.log(`Title: ${r.title}`);
	console.log(`Link: ${r.link}`);
	console.log(`Snippet: ${r.snippet}`);
	if (r.content) {
		console.log(`Content:\n${r.content}`);
	}
	console.log("");
}

await browser.close();
process.exit(0);
