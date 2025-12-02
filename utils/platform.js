#!/usr/bin/env node

import os from "os";
import path from "path";
import fs from "fs";

export function getChromePath() {
  switch (process.platform) {
    case "darwin": {
      const chromePath =
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      return fs.existsSync(chromePath) ? chromePath : null;
    }
    case "win32": {
      const paths = [
        path.join(
          process.env.LOCALAPPDATA || "",
          "Google/Chrome/Application/chrome.exe",
        ),
        path.join(
          process.env.PROGRAMFILES || "",
          "Google/Chrome/Application/chrome.exe",
        ),
        path.join(
          process.env["PROGRAMFILES(X86)"] || "",
          "Google/Chrome/Application/chrome.exe",
        ),
      ].filter(Boolean);
      return paths.find((p) => fs.existsSync(p)) || null;
    }
    case "linux": {
      const chromePaths = [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/snap/bin/chromium",
        "/usr/bin/google-chrome-stable",
      ];
      return chromePaths.find((p) => fs.existsSync(p)) || null;
    }
    default:
      return null;
  }
}

export function getChromeProfilePath() {
  try {
    switch (process.platform) {
      case "darwin":
        return path.join(
          os.homedir(),
          "Library/Application Support/Google/Chrome",
        );
      case "win32":
        return path.join(
          process.env.LOCALAPPDATA || os.homedir(),
          "Google/Chrome/User Data",
        );
      case "linux":
        return path.join(os.homedir(), ".config/google-chrome");
      default:
        return null;
    }
  } catch (e) {
    return null;
  }
}

export function getCacheDir(name) {
  try {
    switch (process.platform) {
      case "win32":
        return path.join(process.env.LOCALAPPDATA || os.tmpdir(), name);
      default:
        return path.join(os.homedir(), ".cache", name);
    }
  } catch (e) {
    return path.join(os.tmpdir(), name);
  }
}
