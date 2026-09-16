use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

/// Where the app's own two facts live: which agent directory to drive, and
/// which node to drive it with. Everything else the agent needs is the agent's
/// own `agent.config.json`, which this app edits in place rather than shadows.
///
/// `scripts/setup.sh` writes this file, so a machine set up from a terminal
/// opens the app already pointed at the right place, and the app's own setup
/// writes it back the same way.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(rename = "agentDir")]
    pub agent_dir: String,
    #[serde(rename = "nodePath")]
    pub node_path: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            agent_dir: agent_dir_candidates().first().cloned().unwrap_or_default(),
            node_path: default_node().to_string_lossy().into_owned(),
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

    /// True when the directory really is an agent checkout, which is the one
    /// thing worth checking before spawning anything out of it.
    pub fn looks_valid(&self) -> bool {
        Path::new(&self.agent_dir).join("src/index.ts").is_file()
    }
}

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

/// A bundled app inherits almost no PATH, so anything outside the bundle has to
/// be looked for in the places it is actually kept.
pub fn found(binary: &str) -> Option<PathBuf> {
    ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]
        .iter()
        .map(|dir| Path::new(dir).join(binary))
        .find(|path| path.is_file())
}

pub fn node_version(node: &str) -> Option<String> {
    let output = Command::new(node).arg("-v").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    (!version.is_empty()).then_some(version)
}

/// Type stripping is what lets the agent run TypeScript with no build step, and
/// it arrived in 22.
pub fn recent_enough(version: &str) -> bool {
    version
        .trim_start_matches('v')
        .split('.')
        .next()
        .and_then(|major| major.parse::<u32>().ok())
        .is_some_and(|major| major >= 22)
}

/// Every directory that looks like an agent checkout, best first. In
/// development the crate sits inside one; installed, it is wherever the person
/// put the repository, and these are the places people put it.
pub fn agent_dir_candidates() -> Vec<String> {
    let mut found = Vec::new();
    let mut add = |path: PathBuf| {
        if !path.join("src/index.ts").is_file() {
            return;
        }
        let resolved = path
            .canonicalize()
            .unwrap_or(path)
            .to_string_lossy()
            .into_owned();
        if !found.contains(&resolved) {
            found.push(resolved);
        }
    };

    add(Path::new(env!("CARGO_MANIFEST_DIR")).join("../.."));
    for parent in ["", "Developer/", "src/", "Projects/", "code/"] {
        add(home().join(format!("{parent}home-assistant/agent")));
    }
    found
}

/// The node the person actually uses, which on a Mac is as likely to be under
/// a version manager as in /opt/homebrew. Anything older than 22 is no use, so
/// a new enough one further down the list beats an old one at the top.
fn default_node() -> PathBuf {
    let mut candidates: Vec<PathBuf> = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
        .iter()
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .collect();

    // A login shell is the only thing that knows about nvm, fnm and volta,
    // because they work by editing the shell's own PATH.
    if let Some(shell) = std::env::var_os("SHELL") {
        if let Ok(output) = Command::new(shell).args(["-lic", "command -v node"]).output() {
            let path = PathBuf::from(String::from_utf8_lossy(&output.stdout).trim());
            if path.is_file() {
                candidates.push(path);
            }
        }
    }

    // And if the shell would not say, the version managers keep their versions
    // somewhere predictable.
    if let Ok(entries) = std::fs::read_dir(home().join(".nvm/versions/node")) {
        let mut versions: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .map(|entry| entry.path().join("bin/node"))
            .filter(|path| path.is_file())
            .collect();
        versions.sort();
        candidates.extend(versions.into_iter().rev());
    }
    candidates.push(home().join(".volta/bin/node"));

    let usable = candidates
        .iter()
        .find(|path| node_version(&path.to_string_lossy()).is_some_and(|v| recent_enough(&v)));

    usable
        .or_else(|| candidates.first())
        .cloned()
        .unwrap_or_else(|| PathBuf::from("node"))
}
