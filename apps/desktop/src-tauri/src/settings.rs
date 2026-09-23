use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

/// The app's own two facts: where `parlour` is, and whether to start it when
/// the app opens. Everything else Parlour needs is Parlour's own config, which
/// the app reads and writes through the CLI rather than shadows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(rename = "parlourBin")]
    pub parlour_bin: String,
    #[serde(default)]
    pub autostart: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            parlour_bin: detect_parlour()
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_default(),
            autostart: false,
        }
    }
}

impl Settings {
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(path, json + "\n").map_err(|e| e.to_string())
    }

    /// True when the path is something that can be run, which is the one
    /// thing worth checking before spawning it. The App Store build has no
    /// path to choose: parlour is inside it, so it is valid when that is.
    pub fn looks_valid(&self) -> bool {
        if cfg!(feature = "appstore") {
            return bundled::script().is_file() && executable(&bundled::node());
        }
        !self.parlour_bin.is_empty() && executable(Path::new(&self.parlour_bin))
    }
}

/// The command that runs parlour, with the PATH every one of them gets. The
/// installed `parlour` is a script that asks for `node` by name; the App
/// Store build runs its own node on its own copy of the script, because the
/// sandbox has no npm and would not let one that npm installed run.
pub fn parlour_command(settings: &Settings) -> Command {
    let mut command = if cfg!(feature = "appstore") {
        let mut command = Command::new(bundled::node());
        command.arg(bundled::script());
        command
    } else {
        Command::new(&settings.parlour_bin)
    };
    command.env("PATH", shell_path());
    command
}

/// Where the App Store build keeps what a terminal install gets from npm and
/// Homebrew. The executables sit beside the app's own in Contents/MacOS,
/// where Tauri puts sidecars; parlour's JavaScript is a resource.
pub mod bundled {
    use std::path::PathBuf;

    /// Contents/MacOS, found from the running executable rather than assumed.
    pub fn bin_dir() -> PathBuf {
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(PathBuf::from))
            .unwrap_or_default()
    }

    pub fn node() -> PathBuf {
        bin_dir().join("node")
    }

    pub fn script() -> PathBuf {
        bin_dir()
            .join("../Resources/parlour/dist/cli/main.js")
            .components()
            .collect()
    }
}

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default()
}

fn executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

/// A bundled app inherits almost no PATH, so anything outside the bundle has to
/// be looked for on the PATH a terminal would have. That is the same PATH the
/// CLI's `which` walks, so the app and `parlour doctor` agree on whether a
/// tool is installed: an ffmpeg from MacPorts or conda counts for both, or for
/// neither. The usual Homebrew and system directories are always on the end
/// of that PATH, so a shell that would not say still finds a `brew install`.
pub fn found(binary: &str) -> Option<PathBuf> {
    found_on(shell_path(), binary)
}

/// `which`, over a given PATH: the first entry holding an executable of that
/// name, in PATH order, so the copy a terminal would run is the one chosen.
fn found_on(path: &str, binary: &str) -> Option<PathBuf> {
    path.split(':')
        .filter(|dir| !dir.is_empty())
        .map(|dir| Path::new(dir).join(binary))
        .find(|path| executable(path))
}

/// The PATH a terminal would have. A login shell is the only thing that knows
/// about nvm, fnm and volta, because they work by editing the shell's own
/// PATH, and `parlour` is a script whose first line asks for `node` by name.
/// Every command the app runs on Parlour's behalf gets this PATH, so what
/// works in a terminal works from the app. Asked once: an interactive shell
/// takes a moment to start, and the answer does not change while the app runs.
pub fn shell_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        // The App Store build asks no shell: the sandbox would not let it read
        // the dotfiles that make the answer worth having, and everything it
        // runs is either inside the app or part of macOS.
        if cfg!(feature = "appstore") {
            return format!(
                "{}:/usr/bin:/bin:/usr/sbin:/sbin",
                bundled::bin_dir().display()
            );
        }
        let mut path = login_shell("echo \"$PATH\"").unwrap_or_default();
        // The usual places go on the end regardless, for a shell that would
        // not say, or a PATH that a dotfile has trimmed.
        for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] {
            if !path.split(':').any(|entry| entry == dir) {
                if !path.is_empty() {
                    path.push(':');
                }
                path.push_str(dir);
            }
        }
        path
    })
}

/// One line of output from the person's own shell, started the way a terminal
/// would start it. Interactive as well as login, because nvm is usually set up
/// in .zshrc, which a plain login shell never reads.
fn login_shell(command: &str) -> Option<String> {
    let shell = std::env::var_os("SHELL")?;
    let output = Command::new(shell).args(["-lic", command]).output().ok()?;
    let line = String::from_utf8_lossy(&output.stdout)
        .lines()
        .last()
        .map(str::trim)
        .unwrap_or_default()
        .to_owned();
    (!line.is_empty()).then_some(line)
}

/// Where `npm install -g parlour` put it, best guess first. The shell is asked
/// before the directories are searched because the shell knows about version
/// managers, and a stale copy in /usr/local/bin should not beat the one the
/// person actually uses.
pub fn detect_parlour() -> Option<PathBuf> {
    if cfg!(feature = "appstore") {
        return Some(bundled::script());
    }
    if let Some(path) = login_shell("command -v parlour").map(PathBuf::from) {
        if executable(&path) {
            return Some(path);
        }
    }
    [
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        home().join(".npm-global/bin"),
    ]
    .iter()
    .map(|dir| dir.join("parlour"))
    .find(|path| executable(path))
}

/// `vX.Y.Z` from `node -v`, or nothing when there is no node to ask.
pub fn node_version() -> Option<String> {
    let output = Command::new("node")
        .arg("-v")
        .env("PATH", shell_path())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    (!version.is_empty()).then_some(version)
}

/// Parlour needs 22: it runs its own source with type stripping in a
/// checkout, and that arrived in 22.
pub fn recent_enough(version: &str) -> bool {
    version
        .trim_start_matches('v')
        .split('.')
        .next()
        .and_then(|major| major.parse::<u32>().ok())
        .is_some_and(|major| major >= 22)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh directory under the system temp dir, removed when dropped, so
    /// the test does not depend on what happens to be installed on the box.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "parlour-desktop-{tag}-{}",
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn file(&self, name: &str, mode: u32) -> PathBuf {
            use std::os::unix::fs::PermissionsExt;
            let path = self.0.join(name);
            std::fs::write(&path, "#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode)).unwrap();
            path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn found_on_walks_every_path_entry_in_order() {
        let ports = TempDir::new("ports");
        let brew = TempDir::new("brew");
        let expected = ports.file("ffmpeg", 0o755);
        brew.file("ffmpeg", 0o755);

        // An ffmpeg somewhere other than the fixed Homebrew and system
        // directories, which is what the fixed list used to miss.
        let path = format!("{}:{}", ports.0.display(), brew.0.display());
        assert_eq!(found_on(&path, "ffmpeg"), Some(expected));
        assert_eq!(found_on(&path, "not-a-tool"), None);
    }

    #[test]
    fn found_on_skips_files_that_cannot_run() {
        let dir = TempDir::new("plain");
        dir.file("ffmpeg", 0o644);
        // An empty entry means the current directory to a shell; skipped here
        // so a stray leading colon never makes the app look in its own cwd.
        let path = format!(":{}", dir.0.display());
        assert_eq!(found_on(&path, "ffmpeg"), None);
    }
}
