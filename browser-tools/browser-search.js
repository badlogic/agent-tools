#!/usr/bin/env node

import puppeteer from "puppeteer-core";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// Global timeout - exit if script takes too long
setTimeout(() => {
	console.error("✗ Timeout after 60s");
	process.exit(1);
}, 60000).unref();

const args = process.argv.slice(2);
const contentIndex = args.indexOf("--content");
const fetchContent = contentIndex !== -1;
if (fetchContent) args.splice(contentIndex, 1);

// Parse -n flag for number of results
let numResults = 5;
const nIndex = args.indexOf("-n");
if (nIndex !== -1 && args[nIndex + 1]) {
	numResults = parseInt(args[nIndex + 1], 10);
	args.splice(nIndex, 2);
}

const query = args.join(" ");

if (!query) {
	console.log("Usage: browser-search.js <query> [-n <num>] [--content]");
	console.log("\nOptions:");
	console.log("  -n <num>    Number of results (default: 5)");
	console.log("  --content   Fetch readable content as markdown");
	console.log("\nExamples:");
	console.log('  browser-search.js "javascript async await"');
	console.log('  browser-search.js "rust programming" -n 10');
	console.log('  browser-search.js "climate change" -n 3 --content');
	process.exit(1);
}

const b = await Promise.race([
	puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	}),
	new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
]).catch((e) => {
	console.error("✗ Could not connect to browser:", e.message);
	console.error("  Run: browser-start.js");
	process.exit(1);
});

const p = (await b.pages()).at(-1);
if (!p) {
	console.error("✗ No active tab found");
	process.exit(1);
}

// Extract results from current page
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

// Navigate and paginate to collect results
const results = [];
let start = 0;

while (results.length < numResults) {
	const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${start}`;
	await p.goto(searchUrl, { waitUntil: "domcontentloaded" });
	await p.waitForSelector("div.MjjYud", { timeout: 5000 }).catch(() => { });

	const pageResults = await extractResults();
	if (pageResults.length === 0) break; // No more results

	for (const r of pageResults) {
		if (results.length >= numResults) break;
		// Avoid duplicates
		if (!results.some((existing) => existing.link === r.link)) {
			results.push(r);
		}
	}

	start += 10; // Google uses 10 results per page
	if (start >= 100) break; // Google limits to ~100 results
}

if (results.length === 0) {
	console.log("No results found");
	process.exit(0);
}

// Helper to get HTML via CDP (works even with TrustedScriptURL restrictions)
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

// Convert Readability HTML to clean text
function htmlToCleanText(html) {
	// Parse HTML and extract text with structure
	const dom = new JSDOM(html);
	const doc = dom.window.document;

	// Remove scripts, styles, empty links, etc
	doc.querySelectorAll("script, style, noscript").forEach((el) => el.remove());

	// Remove empty links and custom empty elements (footnote-style references)
	doc.querySelectorAll("a, q-l").forEach((el) => {
		if (!el.textContent?.trim()) el.remove();
	});

	// Get text content
	let text = doc.body.textContent || "";

	return text
		.replace(/\[\s*\]/g, "") // remove empty brackets
		.replace(/\(\s*\)/g, "") // remove empty parens
		.replace(/\s*,\s*,/g, ",") // collapse double commas
		.replace(/\n\s*,/g, ",") // fix ", text" on new line
		.replace(/\n\s*\./g, ".") // fix ". text" on new line
		.replace(/ +([.,;:])/g, "$1") // remove space before punctuation
		.replace(/\n[ \t]+/g, "\n") // remove leading whitespace on lines
		.replace(/[ \t]+\n/g, "\n") // remove trailing whitespace on lines
		.replace(/[ \t]+/g, " ") // collapse spaces/tabs
		.replace(/\n{2,}/g, "\n\n") // collapse multiple newlines to 2
		.replace(/^\s*[.,;:]\s*$/gm, "") // remove lines with just punctuation
		.replace(/\n{2,}/g, "\n\n") // collapse again
		.replace(/(\w)\n\n(and|or|but|the|a|an|to|in|of|for|with|on|at|by|from|as)\b/gi, "$1 $2") // rejoin broken sentences
		.replace(/(\w)\n([a-z])/g, "$1 $2") // single newline mid-sentence -> space
		.trim();
}

// Convert HTML to markdown
function htmlToMarkdown(html) {
	const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
	turndown.use(gfm);
	// Remove empty links (footnote-style references)
	turndown.addRule("removeEmptyLinks", {
		filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
		replacement: () => "",
	});
	return turndown
		.turndown(html)
		.replace(/\[\\?\[\s*\\?\]\]\([^)]*\)/g, "") // remove empty bracket links like [\[ \]](url)
		.replace(/ +/g, " ") // collapse multiple spaces
		.replace(/\s+,/g, ",") // fix space before comma
		.replace(/\s+\./g, ".") // fix space before period
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

// Optionally fetch readable content for each result
if (fetchContent) {
	for (const result of results) {
		try {
			await Promise.race([
				p.goto(result.link, { waitUntil: "networkidle2" }),
				new Promise((r) => setTimeout(r, 5000)),
			]).catch(() => { });

			const html = await getHtmlViaCDP(p);
			const url = p.url();

			const doc = new JSDOM(html, { url });
			const reader = new Readability(doc.window.document);
			const article = reader.parse();

			if (article && article.content) {
				result.content = htmlToMarkdown(article.content).substring(0, 5000);
			} else {
				// Fallback: extract main content area or body text
				const fallbackDoc = new JSDOM(html, { url });
				const fallbackBody = fallbackDoc.window.document;
				// Remove noise
				fallbackBody.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((el) => el.remove());
				// Try to find main content
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

// Output results
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

process.exit(0);
