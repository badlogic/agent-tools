#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export async function syncDirectory(src, dest, options = {}) {
  const { exclude = [] } = options;

  await mkdir(dest, { recursive: true });

  if (process.platform === "win32") {
    const excludeDirs = exclude.map((p) => p.replace(/\//g, "\\"));
    const args = [
      src,
      dest,
      "/E",
      "/SL",
      "/DCOPY:DAT",
      "/COPY:DAT",
      "/R:2",
      "/W:1",
      "/NP",
      "/NDL",
      "/NFL",
      "/NJH",
      "/NJS",
    ];

    for (const pattern of excludeDirs) {
      args.push("/XD", `*${pattern}*`);
      args.push("/XF", `*${pattern}*`);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn("robocopy", args, { stdio: "ignore" });
      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn robocopy: ${err.message}`));
      });
      proc.on("close", (code) => {
        if (code >= 8) {
          reject(new Error(`robocopy failed with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  } else {
    const excludeArgs = exclude.flatMap((p) => ["--exclude", p]);
    const args = ["-a", ...excludeArgs, `${src}/`, dest];

    try {
      await execFile("rsync", args);
    } catch (e) {
      if (e.code === "ENOENT") {
        throw new Error(
          "rsync not found. Please install rsync to use this feature.",
        );
      }
      throw new Error(`rsync failed: ${e.message}`);
    }
  }
}
