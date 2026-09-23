/**
 * Puts together what the Mac App Store build of Parlour.app carries inside it,
 * because the sandbox lets it install nothing and run nothing from outside:
 *
 *   src-tauri/binaries/node-<triple>            Node, from nodejs.org
 *   src-tauri/binaries/ffmpeg-<triple>          ffmpeg, built LGPL and small
 *   src-tauri/binaries/whisper-server-<triple>  whisper.cpp's server, static, Metal
 *   src-tauri/binaries/llama-server-<triple>    llama.cpp's server, static, Metal
 *   appstore/runtime/parlour/                   the parlour package and its dependencies
 *
 * Tauri copies the binaries into Contents/MacOS (`externalBin`) and the package
 * into Contents/Resources (`resources`), as tauri.appstore.conf.json says.
 *
 * Everything downloaded is checked against a hash before it is used, and
 * everything built is cached under appstore/.cache by version, so a second run
 * only restages the package. Apple silicon only, like the dmg.
 *
 * Usage: node --experimental-strip-types apps/desktop/appstore/stage.ts
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TRIPLE = "aarch64-apple-darwin";
/** The oldest macOS the App Store build runs on; SMAppService arrived in 13. */
const MACOS_MIN = "13.0";

const NODE_VERSION = "22.23.2";

const FFMPEG_VERSION = "9.0.2";
/** Recorded from ffmpeg.org when this version was pinned; bump both together. */
const FFMPEG_SHA256 = "8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e";

const WHISPER = { repo: "https://github.com/ggml-org/whisper.cpp", tag: "v1.9.4", commit: "927cfce34f31707e17f2bff35c349632fb9e2c3a" };
const LLAMA = { repo: "https://github.com/ggml-org/llama.cpp", tag: "b11125", commit: "94256114c229674ef96e76eb2dea596e65b43818" };

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");
const root = resolve(desktop, "..", "..");
const cache = join(here, ".cache");
const binaries = join(desktop, "src-tauri", "binaries");
const runtime = join(here, "runtime");

function sh(command: string, args: string[], cwd = root, env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) {
    // Most often a build tool that is not installed; the CI job installs them.
    throw new Error(`could not run ${command}: ${result.error.message}. cmake comes from brew install cmake.`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status ?? result.signal}`);
  }
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
}

function verify(file: string, expected: string): void {
  const actual = sha256(file);
  if (actual !== expected) {
    // A cached file that is wrong is not kept to fail again next time.
    rmSync(file, { force: true });
    throw new Error(`${file} has sha256 ${actual}, expected ${expected}`);
  }
}

function place(built: string, name: string): void {
  const dest = join(binaries, `${name}-${TRIPLE}`);
  copyFileSync(built, dest);
  chmodSync(dest, 0o755);
  console.log(`Staged ${dest}`);
}

/** Node from nodejs.org, checked against the SHASUMS file published beside it. */
async function node(): Promise<void> {
  const name = `node-v${NODE_VERSION}-darwin-arm64`;
  const tarball = join(cache, `${name}.tar.gz`);
  await download(`https://nodejs.org/dist/v${NODE_VERSION}/${name}.tar.gz`, tarball);
  const sums = await (await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`)).text();
  const expected = sums.split("\n").find((line) => line.endsWith(`  ${name}.tar.gz`))?.split(" ")[0];
  if (!expected) throw new Error(`no checksum for ${name}.tar.gz`);
  verify(tarball, expected);
  sh("tar", ["-xzf", tarball, "-C", cache, `${name}/bin/node`, `${name}/LICENSE`]);
  place(join(cache, name, "bin", "node"), "node");
}

/**
 * ffmpeg, built with only what Parlour asks of it: the microphone through
 * avfoundation, what phones record in (Opus in WebM, AAC in MP4) and WAV and
 * raw PCM out. LGPL throughout, with nothing from Homebrew linked in, so what
 * ships is the one binary and its licence is one the store can carry.
 */
async function ffmpeg(): Promise<void> {
  const out = join(cache, `ffmpeg-${FFMPEG_VERSION}-install`, "bin", "ffmpeg");
  if (!existsSync(out)) {
    const tarball = join(cache, `ffmpeg-${FFMPEG_VERSION}.tar.xz`);
    await download(`https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz`, tarball);
    verify(tarball, FFMPEG_SHA256);
    sh("tar", ["-xJf", tarball, "-C", cache]);
    const src = join(cache, `ffmpeg-${FFMPEG_VERSION}`);
    const flags = `-mmacosx-version-min=${MACOS_MIN}`;
    sh(
      "./configure",
      [
        `--prefix=${join(cache, `ffmpeg-${FFMPEG_VERSION}-install`)}`,
        "--arch=arm64",
        `--extra-cflags=${flags}`,
        `--extra-ldflags=${flags}`,
        "--enable-static",
        "--disable-shared",
        "--disable-autodetect",
        "--disable-doc",
        "--disable-debug",
        "--disable-ffplay",
        "--disable-ffprobe",
        "--disable-network",
        "--disable-everything",
        "--enable-avfoundation",
        "--enable-indev=avfoundation",
        "--enable-protocol=file,pipe",
        "--enable-demuxer=wav,matroska,mov,ogg,aac,mp3,flac",
        "--enable-parser=opus,aac,mpegaudio,vorbis,flac",
        "--enable-decoder=pcm_s16le,pcm_s16be,pcm_s24le,pcm_s32le,pcm_f32le,pcm_f32be,opus,aac,mp3,vorbis,flac",
        "--enable-encoder=pcm_s16le",
        "--enable-muxer=wav,pcm_s16le,null",
        "--enable-filter=aresample,aformat,anull,atrim,abuffer,abuffersink",
        "--enable-swresample",
      ],
      src,
    );
    sh("make", ["-j8"], src);
    sh("make", ["install"], src);
  }
  place(out, "ffmpeg");
}

/** One of the ggml servers, at a pinned commit, static and with its Metal shaders built in. */
function ggml(
  project: { repo: string; tag: string; commit: string },
  target: string,
  extra: string[],
): void {
  const src = join(cache, `${target}-${project.tag}`);
  const out = join(src, "build", "bin", target);
  if (!existsSync(out)) {
    if (!existsSync(src)) {
      sh("git", ["clone", "--depth", "1", "--branch", project.tag, project.repo, src]);
    }
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: src, encoding: "utf8" }).stdout.trim();
    if (head !== project.commit) {
      rmSync(src, { recursive: true, force: true });
      throw new Error(`${project.repo} ${project.tag} is ${head}, expected ${project.commit}`);
    }
    sh(
      "cmake",
      [
        "-B",
        "build",
        "-DCMAKE_BUILD_TYPE=Release",
        `-DCMAKE_OSX_DEPLOYMENT_TARGET=${MACOS_MIN}`,
        "-DCMAKE_OSX_ARCHITECTURES=arm64",
        "-DBUILD_SHARED_LIBS=OFF",
        "-DGGML_NATIVE=OFF",
        "-DGGML_METAL=ON",
        "-DGGML_METAL_EMBED_LIBRARY=ON",
        ...extra,
      ],
      src,
    );
    sh("cmake", ["--build", "build", "--config", "Release", "--target", target, "-j8"], src);
  }
  place(out, target);
}

/**
 * The parlour package as npm would install it, from this checkout: built, then
 * deployed with production dependencies only and a flat node_modules, because
 * pnpm's symlinked store is not something to sign and ship inside an app.
 */
function parlour(): void {
  const dest = join(runtime, "parlour");
  rmSync(dest, { recursive: true, force: true });
  sh("pnpm", ["--filter", "parlour", "build"]);
  sh("pnpm", ["--filter", "parlour", "deploy", "--prod", "--legacy", "--config.node-linker=hoisted", dest]);

  // Links to the dependencies' command line tools, which nothing here runs.
  rmSync(join(dest, "node_modules", ".bin"), { recursive: true, force: true });

  // onnxruntime ships every platform's library in one package. Only this
  // Mac's are kept: the rest is dead weight, and code for another platform
  // inside a bundle is something App Store validation asks about.
  const ort = join(dest, "node_modules", "onnxruntime-node", "bin");
  if (existsSync(ort)) {
    for (const napi of readdirSync(ort)) {
      for (const platform of readdirSync(join(ort, napi))) {
        if (platform !== "darwin") {
          rmSync(join(ort, napi, platform), { recursive: true, force: true });
          continue;
        }
        for (const arch of readdirSync(join(ort, napi, platform))) {
          if (arch !== "arm64") rmSync(join(ort, napi, platform, arch), { recursive: true, force: true });
        }
      }
    }
  }
  console.log(`Staged ${dest}`);
}

/**
 * The licence of everything the app carries that is not Parlour's own, beside
 * it in Contents/Resources/licences. ffmpeg's LGPL asks for this, and for the
 * way to rebuild it, which is this file.
 */
function licences(): void {
  const dest = join(runtime, "licences");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const copy = (from: string, name: string) => {
    if (!existsSync(from)) throw new Error(`no licence at ${from}`);
    copyFileSync(from, join(dest, name));
  };
  copy(join(cache, `node-v${NODE_VERSION}-darwin-arm64`, "LICENSE"), "node.txt");
  copy(join(cache, `ffmpeg-${FFMPEG_VERSION}`, "COPYING.LGPLv2.1"), "ffmpeg.txt");
  copy(join(cache, `whisper-server-${WHISPER.tag}`, "LICENSE"), "whisper.cpp.txt");
  copy(join(cache, `llama-server-${LLAMA.tag}`, "LICENSE"), "llama.cpp.txt");
  writeFileSync(
    join(dest, "README.txt"),
    [
      "Parlour carries these programs, each under its own licence, in this folder.",
      "",
      `node ${NODE_VERSION}, from nodejs.org, unmodified.`,
      `ffmpeg ${FFMPEG_VERSION}, LGPL 2.1 or later, built from the source at ffmpeg.org`,
      "with the configuration in apps/desktop/appstore/stage.ts at https://github.com/mrprkr/parlour.",
      `whisper.cpp ${WHISPER.tag} and llama.cpp ${LLAMA.tag}, MIT, built from their GitHub sources.`,
      "",
      "Parlour's own dependencies carry their licences in Contents/Resources/parlour/node_modules.",
      "",
    ].join("\n"),
  );
  console.log(`Staged ${dest}`);
}

async function main(): Promise<void> {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("The App Store build is made on an Apple silicon Mac.");
  }
  mkdirSync(cache, { recursive: true });
  mkdirSync(binaries, { recursive: true });
  mkdirSync(runtime, { recursive: true });

  await node();
  await ffmpeg();
  ggml(WHISPER, "whisper-server", ["-DWHISPER_BUILD_TESTS=OFF", "-DWHISPER_SDL2=OFF"]);
  ggml(LLAMA, "llama-server", ["-DLLAMA_BUILD_TESTS=OFF", "-DLLAMA_CURL=OFF", "-DLLAMA_OPENSSL=OFF"]);
  parlour();
  licences();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
