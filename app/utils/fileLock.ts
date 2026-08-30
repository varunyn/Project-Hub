import fs from "node:fs";
import path from "node:path";

const STALE_LOCK_MS = 10_000;
const RETRY_COUNT = 40;
const RETRY_DELAY_MS = 50;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Serialize read-modify-write operations across the Next.js and MCP processes. */
export async function withFileLock<T>(
  filePath: string,
  operation: () => Promise<T> | T
): Promise<T> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]", "utf8");
  const lockPath = `${filePath}.lock`;
  let handle: fs.promises.FileHandle | undefined;
  for (let attempt = 0; attempt < RETRY_COUNT; attempt += 1) {
    try {
      handle = await fs.promises.open(lockPath, "wx");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > STALE_LOCK_MS) fs.unlinkSync(lockPath);
      } catch {
        // Another process may release or replace the lock between stat and unlink.
      }
      await delay(RETRY_DELAY_MS);
    }
  }
  if (!handle) throw new Error(`Timed out waiting for data file lock: ${lockPath}`);
  try {
    return await operation();
  } finally {
    await handle.close();
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // The lock may have been removed as stale by another process.
    }
  }
}
