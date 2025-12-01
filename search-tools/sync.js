#!/usr/bin/env node

import fsPromises from "fs/promises";
import path from "path";
import pLimit from "p-limit";

async function copyWithRetry(srcPath, destPath, maxRetries = 3) {
	for (let i = 0; i < maxRetries; i++) {
		try {
			await fsPromises.copyFile(srcPath, destPath);
			return;
		} catch (e) {
			if ((e.code === "EBUSY" || e.code === "EACCES") && i < maxRetries - 1) {
				await new Promise((r) => setTimeout(r, 100 * (i + 1)));
				continue;
			}
			throw e;
		}
	}
}

export async function syncDirectory(src, dest, options = {}) {
	const { exclude = [], concurrency = 50 } = options;
	const limit = pLimit(concurrency);

	async function sync(srcDir, destDir, rootSrc = src) {
		await fsPromises.mkdir(destDir, { recursive: true });
		const entries = await fsPromises.readdir(srcDir, { withFileTypes: true });

		const tasks = entries.map((entry) =>
			limit(async () => {
				const srcPath = path.join(srcDir, entry.name);
				const relativePath = path.relative(rootSrc, srcPath);
				
				if (exclude.some((p) => entry.name.includes(p) || relativePath.includes(p))) return;

				const destPath = path.join(destDir, entry.name);

				// Handle symlinks
				if (entry.isSymbolicLink()) {
					const target = await fsPromises.readlink(srcPath);
					await fsPromises.rm(destPath, { force: true }).catch(() => {});
					await fsPromises.symlink(target, destPath).catch(() => {});
					return;
				}

				if (entry.isDirectory()) {
					await sync(srcPath, destPath, rootSrc);
				} else {
					// Delta sync: skip if unchanged (mtime + size)
					const srcStat = await fsPromises.stat(srcPath);
					const destStat = await fsPromises.stat(destPath).catch(() => null);

					if (destStat && srcStat.mtimeMs <= destStat.mtimeMs && srcStat.size === destStat.size) {
						return; // Skip unchanged
					}

					// Copy with retry for locked files (Windows)
					await copyWithRetry(srcPath, destPath);
				}
			}),
		);

		await Promise.all(tasks);
	}

	await sync(src, dest);
}

