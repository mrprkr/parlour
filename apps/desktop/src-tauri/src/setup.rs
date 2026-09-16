use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::settings::{self, found, node_version, recent_enough, Settings};

/// What the onboarding needs to know: which pieces are already in place, so it
/// can show what is left rather than making someone read a README to find out.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Readiness {
    pub agent_dir: String,
    pub agent_dir_ok: bool,
    /// Directories that look like an agent checkout, offered as a choice.
    pub candidates: Vec<String>,
    pub node_path: String,
    pub node_version: Option<String>,
    pub node_ok: bool,
    pub packages: bool,
    pub models: bool,
    pub config: bool,
    pub ffmpeg: bool,
    pub whisper: bool,
    pub homebrew: bool,
    /// Nothing left for the install step to do.
    pub installed: bool,
}

fn has_whisper_model(agent: &Path) -> bool {
    std::fs::read_dir(agent.join("models/whisper"))
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .any(|entry| entry.path().extension().is_some_and(|e| e == "bin"))
        })
        .unwrap_or(false)
}

pub fn inspect(settings: &Settings) -> Readiness {
    let agent = PathBuf::from(&settings.agent_dir);
    let agent_dir_ok = settings.looks_valid();

    let version = node_version(&settings.node_path);
    let node_ok = version.as_deref().is_some_and(recent_enough);

    let packages = agent.join("node_modules/onnxruntime-node").is_dir();
    let models = agent.join("models/openwakeword/melspectrogram.onnx").is_file() && has_whisper_model(&agent);
    let config = agent.join("agent.config.json").is_file();

    let mut readiness = Readiness {
        agent_dir: settings.agent_dir.clone(),
        agent_dir_ok,
        candidates: settings::agent_dir_candidates(),
        node_path: settings.node_path.clone(),
        node_version: version,
        node_ok,
        packages,
        models,
        config,
        ffmpeg: found("ffmpeg").is_some(),
        whisper: found("whisper-server").is_some(),
        homebrew: found("brew").is_some(),
        installed: false,
    };
    readiness.installed = agent_dir_ok && node_ok && packages && models && config && readiness.ffmpeg;
    readiness
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Event {
    /// step, ok, warn, fail, log or done.
    kind: String,
    text: String,
}

fn emit(app: &AppHandle, kind: &str, text: &str) {
    let _ = app.emit(
        "setup://event",
        Event {
            kind: kind.to_owned(),
            text: text.to_owned(),
        },
    );
}

/// Runs the agent's own `scripts/setup.sh`, which is the same script the
/// terminal installer calls. Every line it prints becomes an event, because a
/// five minute install behind a spinner is indistinguishable from a hang.
pub fn run(app: &AppHandle, settings: &Settings, wake_word: Option<String>) -> Result<bool, String> {
    let script = Path::new(&settings.agent_dir).join("scripts/setup.sh");
    if !script.is_file() {
        return Err(format!("No setup script at {}", script.display()));
    }

    let bash = found("bash").unwrap_or_else(|| PathBuf::from("/bin/bash"));
    let mut command = Command::new(bash);
    command
        .arg(&script)
        .arg("--porcelain")
        .current_dir(&settings.agent_dir)
        // Not NODE_PATH, which would change how node resolves modules. This is
        // only a hint about where to look for the binary itself.
        .env("NODE_PATH_HINT", &settings.node_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(word) = wake_word.filter(|w| !w.is_empty()) {
        command.env("WAKE_WORDS", word);
    }

    let mut child = command.spawn().map_err(|e| format!("could not run the setup script: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    // stderr is whatever the tools underneath had to say. It is log text, not
    // events, so it goes on a thread of its own and never reaches the parser.
    let noise = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            emit(&noise, "log", &line);
        }
    });

    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        let (kind, text) = line.split_once(' ').unwrap_or((line.as_str(), ""));
        match kind {
            "step" | "ok" | "warn" | "fail" | "log" | "done" => emit(app, kind, text),
            // A line the script did not label is still worth showing.
            _ => emit(app, "log", &line),
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    Ok(status.success())
}
