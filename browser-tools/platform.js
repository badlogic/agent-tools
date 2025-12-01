#!/usr/bin/env node

import os from "os";
import path from "path";
import fs from "fs";

export function getChromePath() {
	switch (process.platform) {
		case "darwin":
			return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
		case "win32": {
			const paths = [
				path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
				path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
				path.join(process.env["PROGRAMFILES(X86)"] || "", "Google/Chrome/Application/chrome.exe"),
			].filter(Boolean);
			return paths.find((p) => fs.existsSync(p));
		}
		case "linux":
			return ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"].find((p) =>
				fs.existsSync(p),
			);
		default:
			return null;
	}
}

export function getChromeProfilePath() {
	switch (process.platform) {
		case "darwin":
			return path.join(os.homedir(), "Library/Application Support/Google/Chrome");
		case "win32":
			return path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/User Data");
		case "linux":
			return path.join(os.homedir(), ".config/google-chrome");
		default:
			return null;
	}
}

export function getCacheDir(name) {
	switch (process.platform) {
		case "win32":
			return path.join(process.env.LOCALAPPDATA || "", name);
		default:
			return path.join(os.homedir(), ".cache", name);
	}
}

