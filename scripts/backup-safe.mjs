import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const projectRoot = process.cwd();
const backupDirEnv = process.env.BACKUP_DIR || "../backups";
const mirrorDirEnv = process.env.BACKUP_MIRROR_DIR || "";
const keepRaw = Number.parseInt(process.env.BACKUP_KEEP || "20", 10);
const keepCount = Number.isFinite(keepRaw) && keepRaw > 0 ? keepRaw : 20;

const backupRoot = path.resolve(projectRoot, backupDirEnv);
const mirrorRoot = mirrorDirEnv ? path.resolve(projectRoot, mirrorDirEnv) : "";
const ts = formatTimestamp(new Date());
const snapshotName = `app-ordenes-safe-${ts}`;
const snapshotDir = path.join(backupRoot, snapshotName);

const skipDirNames = new Set([
  "node_modules",
  "dist",
  ".vite",
  ".git",
  ".idea",
  ".vscode",
  ".cache",
  ".turbo",
  "coverage",
]);

const skipFileRegex = [
  /\.log$/i,
  /^npm-debug\.log/i,
  /^pnpm-debug\.log/i,
  /^yarn-debug\.log/i,
  /^yarn-error\.log/i,
];

const criticalFiles = [
  "src/App.jsx",
  "server/diagnosticoServicioServer.mjs",
  "package.json",
  "package-lock.json",
  ".env.diagnostico.local",
].filter((rel) => fs.existsSync(path.join(projectRoot, rel)));

const stats = {
  files: 0,
  dirs: 0,
  bytes: 0,
  skipped: 0,
};

async function main() {
  await fs.promises.mkdir(backupRoot, { recursive: true });
  await fs.promises.mkdir(snapshotDir, { recursive: true });

  await copyTree(projectRoot, snapshotDir);
  await validateSnapshot();
  const manifest = await createManifest();
  await fs.promises.writeFile(
    path.join(snapshotDir, "backup-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  await fs.promises.writeFile(
    path.join(backupRoot, "LATEST_OK.txt"),
    `${snapshotName}\n${new Date().toISOString()}\n`,
    "utf8"
  );

  if (mirrorRoot) {
    await fs.promises.mkdir(mirrorRoot, { recursive: true });
    const mirrorSnapshot = path.join(mirrorRoot, snapshotName);
    await fs.promises.rm(mirrorSnapshot, { recursive: true, force: true });
    await fs.promises.cp(snapshotDir, mirrorSnapshot, { recursive: true, force: true });
  }

  await pruneOldSnapshots(backupRoot, keepCount);
  if (mirrorRoot) {
    await pruneOldSnapshots(mirrorRoot, keepCount);
  }

  console.log("BACKUP_OK");
  console.log(`snapshot=${snapshotDir}`);
  if (mirrorRoot) console.log(`mirror=${path.join(mirrorRoot, snapshotName)}`);
  console.log(`files=${stats.files} dirs=${stats.dirs} bytes=${stats.bytes}`);
  console.log(`skipped=${stats.skipped}`);
}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function normalizeRel(relPath) {
  if (!relPath) return "";
  return relPath.split(path.sep).join("/");
}

function shouldSkip(relPath, dirent) {
  const rel = normalizeRel(relPath);
  const name = String(dirent?.name || path.basename(relPath || "")).toLowerCase();

  if (!rel) return false;

  if (rel === snapshotName || rel.startsWith(`${snapshotName}/`)) return true;
  if (rel === "backups" || rel.startsWith("backups/")) return true;
  if (rel === "android/build" || rel.startsWith("android/build/")) return true;

  if (dirent?.isDirectory?.()) {
    if (skipDirNames.has(name)) return true;
    return false;
  }

  if (dirent?.isFile?.()) {
    for (const rx of skipFileRegex) {
      if (rx.test(dirent.name)) return true;
    }
  }

  return false;
}

async function copyTree(fromRoot, toRoot) {
  const entries = await fs.promises.readdir(fromRoot, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(fromRoot, entry.name);
    const relPath = path.relative(projectRoot, srcPath);
    if (shouldSkip(relPath, entry)) {
      stats.skipped += 1;
      continue;
    }

    const destPath = path.join(toRoot, relPath);

    if (entry.isDirectory()) {
      await fs.promises.mkdir(destPath, { recursive: true });
      stats.dirs += 1;
      await copyTree(srcPath, toRoot);
      continue;
    }

    if (!entry.isFile()) {
      stats.skipped += 1;
      continue;
    }

    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await fs.promises.copyFile(srcPath, destPath);
    const st = await fs.promises.stat(destPath);
    stats.files += 1;
    stats.bytes += st.size;
  }
}

async function validateSnapshot() {
  if (stats.files === 0 || stats.bytes === 0) {
    throw new Error("Backup vacio. Se cancelo para evitar falso respaldo.");
  }

  for (const rel of criticalFiles) {
    const src = path.join(projectRoot, rel);
    const dst = path.join(snapshotDir, rel);
    if (!fs.existsSync(dst)) {
      throw new Error(`Falta archivo critico en backup: ${rel}`);
    }
    const [srcStat, dstStat] = await Promise.all([fs.promises.stat(src), fs.promises.stat(dst)]);
    if (srcStat.size !== dstStat.size) {
      throw new Error(`Tamano distinto en archivo critico: ${rel}`);
    }
  }
}

async function createManifest() {
  const checksums = {};
  for (const rel of criticalFiles) {
    checksums[rel] = await sha256(path.join(snapshotDir, rel));
  }
  return {
    createdAt: new Date().toISOString(),
    snapshotName,
    projectRoot,
    backupRoot,
    mirrorRoot: mirrorRoot || null,
    keepCount,
    stats,
    criticalFiles,
    checksums,
  };
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function pruneOldSnapshots(rootDir, keep) {
  const all = await fs.promises.readdir(rootDir, { withFileTypes: true });
  const snapshots = all
    .filter((entry) => entry.isDirectory() && /^app-ordenes-safe-\d{8}-\d{6}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  const toDelete = snapshots.slice(keep);
  for (const name of toDelete) {
    await fs.promises.rm(path.join(rootDir, name), { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("BACKUP_FAILED");
  console.error(error?.message || error);
  process.exit(1);
});
