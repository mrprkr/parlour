use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Where the app's own two facts live: which agent directory to drive, and
/// which node to drive it with. Everything else the agent needs is the agent's
/// own `agent.config.json`, which this app edits in place rather than shadows.
///
/// `install.sh` writes this file, so a machine set up by the installer opens
/// the app already pointed at the right place.
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
            agent_dir: default_agent_dir(),
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

/// In development the crate sits inside the checkout, so the agent is two
/// directories up. Installed, it is wherever the person put the repository,
/// and these are the places people put it.
fn default_agent_dir() -> String {
    let dev = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let candidates = [
        dev,
        home().join("home-assistant/agent"),
        home().join("Developer/home-assistant/agent"),
        home().join("src/home-assistant/agent"),
    ];
    for candidate in candidates {
        if candidate.join("src/index.ts").is_file() {
            return candidate
                .canonicalize()
                .unwrap_or(candidate)
                .to_string_lossy()
                .into_owned();
        }
    }
    String::new()
}

/// A LaunchAgent and a bundled app both start with a bare PATH, so node has to
/// be found rather than assumed.
fn default_node() -> PathBuf {
    for candidate in [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return path;
        }
    }
    PathBuf::from("node")
}
