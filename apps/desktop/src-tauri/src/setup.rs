use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::settings::{found, node_version, parlour_command, recent_enough, shell_path, Settings};

/// What the onboarding needs to know: which pieces are already in place, so it
/// can show what is left rather than making someone read a README to find out.
/// The app knows about `parlour` and `node` because it is the one that has to
/// find them; everything past that is Parlour's own business, and the doctor's.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Readiness {
    pub parlour_bin: String,
    pub parlour_version: Option<String>,
    pub parlour_ok: bool,
    pub node_version: Option<String>,
    pub node_ok: bool,
    pub ffmpeg: bool,
    /// Whether `parlour init` has written a config yet.
    pub config: bool,
    /// Nothing left for the install step to do.
    pub installed: bool,
    /// The App Store build: node, parlour and ffmpeg are inside the app, so
    /// there is nothing to install from npm and no path to choose.
    pub bundled: bool,
}

/// One line of the CLI's stdout, when asked to run it. Not an error: a
/// command that fails says so through its exit status and stderr.
fn output(settings: &Settings, args: &[&str]) -> Option<String> {
    let output = parlour_command(settings)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    (!text.is_empty()).then_some(text)
}

pub fn inspect(settings: &Settings) -> Readiness {
    let parlour_version = settings
        .looks_valid()
        .then(|| output(settings, &["--version"]))
        .flatten();
    let parlour_ok = parlour_version.is_some();

    let version = node_version();
    let node_ok = version.as_deref().is_some_and(recent_enough);

    // The CLI says where its config is, so the app need not know the rule.
    let config = parlour_ok
        && output(settings, &["config", "path"])
            .map(|path| Path::new(&path).is_file())
            .unwrap_or(false);
    let ffmpeg = found("ffmpeg").is_some();

    Readiness {
        parlour_bin: settings.parlour_bin.clone(),
        parlour_version,
        parlour_ok,
        node_version: version,
        node_ok,
        ffmpeg,
        config,
        installed: parlour_ok && node_ok && ffmpeg && config,
        bundled: cfg!(feature = "appstore"),
    }
}

/// One line of `parlour init --porcelain`, which is also the shape the window
/// receives, so a line that parses is forwarded as it is.
#[derive(Clone, Serialize, Deserialize)]
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

/// Runs a command with its stdout read line by line into the setup log, and
/// its stderr relayed as log text on a thread of its own so it never reaches
/// the parser. Every line becomes an event, because a five minute install
/// behind a spinner is indistinguishable from a hang.
///
/// The answer is the exit status and the command's own verdict together:
/// `parlour init` exits 0 after a failing doctor check, saying so only through
/// its final `done` line, and a "1" there is a failure the window has to show.
fn stream(app: &AppHandle, mut command: Command, what: &str) -> Result<bool, String> {
    let mut child = command
        .env("PATH", shell_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not run {what}: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    let noise = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            emit(&noise, "log", &line);
        }
    });

    let mut verdict: Option<String> = None;
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        match serde_json::from_str::<Event>(&line) {
            Ok(event) => {
                if event.kind == "done" {
                    verdict = Some(event.text.clone());
                }
                emit(app, &event.kind, &event.text);
            }
            // A line that is not an event is still worth showing.
            Err(_) => emit(app, "log", &line),
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    Ok(status.success() && verdict.as_deref() != Some("1"))
}

/// Runs Parlour's own `init`, which is the same thing a terminal runs, taking
/// every default. Without a terminal it asks nothing, so the secrets and the
/// choices are the window's to collect afterwards, through the CLI.
pub fn run(app: &AppHandle, settings: &Settings, deps: bool) -> Result<bool, String> {
    if !settings.looks_valid() {
        return Err(format!(
            "No parlour at {:?}. Install it first.",
            settings.parlour_bin
        ));
    }
    let mut command = parlour_command(settings);
    command.args(["init", "--porcelain", "--yes"]);
    // Inside the sandbox there is no Homebrew to ask and no LaunchAgent to
    // write; the tools came with the app and the app keeps Parlour running.
    if !deps || cfg!(feature = "appstore") {
        command.arg("--no-deps");
    }
    if cfg!(feature = "appstore") {
        command.arg("--no-service");
    }
    stream(app, command, "parlour init")
}

/// `npm install -g parlour` at the app's own version, so the two are never
/// out of step. npm is found through the shell's PATH, the same way `node` is,
/// which is what makes a version manager's install work from a bundled app.
pub fn install_cli(app: &AppHandle, version: &str) -> Result<bool, String> {
    if cfg!(feature = "appstore") {
        return Err("This copy of the app carries parlour inside it, so there is nothing to install.".into());
    }
    emit(app, "step", &format!("Installing parlour {version}"));
    let mut command = Command::new("npm");
    command.args(["install", "-g", &format!("parlour@{version}")]);
    let ok = stream(app, command, "npm")?;
    emit(
        app,
        if ok { "ok" } else { "fail" },
        if ok {
            "installed"
        } else {
            "npm did not finish"
        },
    );
    emit(app, "done", if ok { "0" } else { "1" });
    Ok(ok)
}
