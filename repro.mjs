// Usage: node repro.mjs. Needs Node 18+ and npm on PATH; resolves this folder's package.json in a temporary copy.
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: { "user-agent": "repro" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
};

const npm = (cwd, args) => {
  const run = spawnSync(`npm ${args.join(" ")}`, {
    cwd,
    encoding: "utf8",
    shell: true,
  });
  if (run.status !== 0)
    throw new Error(
      `npm ${args.join(" ")} exited ${run.status}: ${run.stderr.trim()}`,
    );
  return run;
};

let folder;
try {
  const sha = (
    await fetchJson(
      "https://api.github.com/repos/callstackincubator/rozenite/commits/main",
    )
  ).sha;
  const ui = await fetchJson("https://registry.npmjs.org/@rozenite/ui/latest");
  console.log(
    `callstackincubator/rozenite main at ${sha}; @rozenite/ui ${ui.version} on npm; node ${process.version}`,
  );
  const mainManifest = (directory) =>
    fetchJson(
      `https://raw.githubusercontent.com/callstackincubator/rozenite/${sha}/packages/${directory}/package.json`,
    );
  const [mainUi, mainShell, shell] = await Promise.all([
    mainManifest("ui"),
    mainManifest("shell"),
    fetchJson(`https://registry.npmjs.org/@rozenite/shell/${ui.version}`),
  ]);

  folder = await mkdtemp(path.join(tmpdir(), "rozenite-lucide-"));
  await copyFile(
    path.join(import.meta.dirname, "package.json"),
    path.join(folder, "package.json"),
  );
  const install = npm(folder, [
    "install",
    "--package-lock-only",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ]);
  console.log(
    `npm ${npm(folder, ["--version"]).stdout.trim()}: npm install --package-lock-only @rozenite/ui@latest react@^19 react-dom@^19`,
  );
  const { packages } = JSON.parse(
    await readFile(path.join(folder, "package-lock.json"), "utf8"),
  );
  const lucide = packages["node_modules/lucide-react"];
  const react = packages["node_modules/react"];
  console.log(
    `@rozenite/ui@${packages["node_modules/@rozenite/ui"].version}: dependencies.lucide-react ${packages["node_modules/@rozenite/ui"].dependencies["lucide-react"]}, peerDependencies.react ${packages["node_modules/@rozenite/ui"].peerDependencies.react}`,
  );
  console.log(
    `lucide-react@${lucide.version}: peerDependencies.react ${lucide.peerDependencies.react}; react resolves to ${react.version}`,
  );
  const conflict = install.stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      /^npm warn (Could not resolve dependency:|Conflicting peer dependency:|peer react@.* from lucide-react@)/.test(
        line,
      ),
    );
  conflict.forEach((line) => console.log(line));
  console.log(
    `on main: @rozenite/ui dependencies.lucide-react ${mainUi.dependencies?.["lucide-react"]}, @rozenite/shell dependencies.lucide-react ${mainShell.dependencies?.["lucide-react"]}`,
  );
  const stillOnMain =
    mainUi.dependencies?.["lucide-react"] === ui.dependencies["lucide-react"] ||
    mainShell.dependencies?.["lucide-react"] ===
      shell.dependencies["lucide-react"];
  if (
    conflict.some((line) => line.includes("from lucide-react@")) &&
    stillOnMain
  ) {
    console.log(
      `SUMMARY: @rozenite/ui@${ui.version} needs React >=19 and installs lucide-react@${lucide.version}, whose React peer excludes ${react.version}, and main declares the same range`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `SUMMARY: npm reports no React peer conflict from lucide-react, or main changed its range`,
    );
    process.exitCode = 0;
  }
} catch (error) {
  console.log(
    `SUMMARY: a step failed before the check: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
} finally {
  if (folder) await rm(folder, { recursive: true, force: true });
}
