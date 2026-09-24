use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::settings::{parlour_command, Settings};

const LOG_LINES: usize = 400;

/// What the window draws. Every field but `running` comes from Parlour's own
/// NDJSON events (`parlour start --events`), so the app never has to guess at
/// its state from log text.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub running: bool,
    /// stopped, idle, listening, thinking or speaking.
    pub state: String,
    pub last_heard: Option<String>,
    pub last_reply: Option<String>,
    /// Which model answered last: local or cloud.
    pub via: Option<String>,
    pub tools: u32,
    pub cloud: bool,
    pub error: Option<String>,
    /// Parlour said it is about to exit so as to be started again, because a
    /// client changed its settings or asked for a restart.
    pub restarting: bool,
}

pub struct Supervisor {
    child: Option<Child>,
    pub status: Arc<Mutex<Status>>,
    pub logs: Arc<Mutex<VecDeque<String>>>,
}

impl Default for Supervisor {
    fn default() -> Self {
        Self {
            child: None,
            status: Arc::new(Mutex::new(Status {
                state: "stopped".into(),
                ..Status::default()
            })),
            logs: Arc::new(Mutex::new(VecDeque::with_capacity(LOG_LINES))),
        }
    }
}

impl Supervisor {
    pub fn running(&mut self) -> bool {
        match self.child.as_mut() {
            // try_wait rather than a flag: the agent can die on its own, and a
            // button that says "stop" next to a dead process is a lie.
            Some(child) => matches!(child.try_wait(), Ok(None)),
            None => false,
        }
    }

    pub fn start(&mut self, app: &AppHandle, settings: &Settings) -> Result<(), String> {
        if self.running() {
            return Ok(());
        }
        if !settings.looks_valid() {
            return Err(format!(
                "No parlour at {:?}. Install it, or say where it is in Settings.",
                settings.parlour_bin
            ));
        }

        let mut child = agent_command(settings)
            .spawn()
            .map_err(|e| format!("could not start {}: {e}", settings.parlour_bin))?;

        let stdout = child.stdout.take().ok_or("no stdout")?;
        let stderr = child.stderr.take().ok_or("no stderr")?;
        self.child = Some(child);

        {
            let mut status = self.status.lock().unwrap();
            *status = Status {
                running: true,
                state: "idle".into(),
                ..Status::default()
            };
            let _ = app.emit("agent://status", status.clone());
        }

        self.pump(app.clone(), BufReader::new(stdout), true);
        self.pump(app.clone(), BufReader::new(stderr), false);
        Ok(())
    }

    /// One thread per stream. Structured events update the status; everything
    /// else is log text, which is the only place a startup failure shows up.
    fn pump<R: BufRead + Send + 'static>(&self, app: AppHandle, reader: R, structured: bool) {
        let status = Arc::clone(&self.status);
        let logs = Arc::clone(&self.logs);
        std::thread::spawn(move || {
            for line in reader.lines().map_while(Result::ok) {
                if structured && line.starts_with('{') {
                    if let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) {
                        apply(&status, &event);
                        let _ = app.emit("agent://status", status.lock().unwrap().clone());
                        let _ = app.emit("agent://event", event);
                        continue;
                    }
                }
                {
                    let mut logs = logs.lock().unwrap();
                    if logs.len() == LOG_LINES {
                        logs.pop_front();
                    }
                    logs.push_back(line.clone());
                }
                let _ = app.emit("agent://log", line);
            }

            // The stream closing is how a crash announces itself, so only the
            // stdout thread reports it and stderr just stops.
            if structured {
                let again = {
                    let mut status = status.lock().unwrap();
                    status.running = false;
                    status.state = "stopped".into();
                    let _ = app.emit("agent://status", status.clone());
                    std::mem::take(&mut status.restarting)
                };
                // A restart a client asked for: Parlour exits, and the app is
                // what starts it again, as launchd would outside the app.
                if again {
                    let state = app.state::<crate::AppState>();
                    let settings = state.settings();
                    let mut supervisor = state.supervisor.lock().unwrap();
                    supervisor.reap();
                    if let Err(error) = supervisor.start(&app, &settings) {
                        let _ = app.emit("agent://error", error);
                    }
                }
            }
        });
    }

    /// Waits for a child that is on its way out, so the next one finds the
    /// port free, and forgets it.
    fn reap(&mut self) {
        let Some(child) = self.child.as_mut() else {
            return;
        };
        for _ in 0..50 {
            if let Ok(Some(_)) = child.try_wait() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        let _ = child.kill();
        let _ = child.wait();
        self.child = None;
    }

    pub fn stop(&mut self) {
        // A stop wins over a restart that was on its way, or the agent would
        // come straight back after the button said it had stopped.
        self.status.lock().unwrap().restarting = false;
        let Some(child) = self.child.as_mut() else {
            return;
        };
        // SIGINT first: Parlour shuts ffmpeg down on it, and a SIGKILL here
        // would leave the microphone held by an orphan.
        let _ = Command::new("kill")
            .args(["-INT", &child.id().to_string()])
            .status();
        for _ in 0..20 {
            if let Ok(Some(_)) = child.try_wait() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        let _ = child.kill();
        let _ = child.wait();
        self.child = None;

        let mut status = self.status.lock().unwrap();
        status.running = false;
        status.state = "stopped".into();
    }
}

/// The command the supervisor runs. `--events` is what makes the status
/// possible: one JSON line per state change on stdout, alongside the ordinary
/// log lines. Only PATH is set, so `LOG_LEVEL` in `secrets.env` is honoured
/// the same as it is in a terminal: the CLI only copies a value from the file
/// when the variable is unset, and the logger defaults to `info` anyway.
fn agent_command(settings: &Settings) -> Command {
    let mut command = parlour_command(settings);
    command
        .args(["start", "--events"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
}

fn apply(status: &Arc<Mutex<Status>>, event: &serde_json::Value) {
    let mut status = status.lock().unwrap();
    let text = |key: &str| event.get(key).and_then(|v| v.as_str()).map(str::to_owned);
    match event.get("type").and_then(|v| v.as_str()) {
        Some("ready") => {
            status.running = true;
            status.tools = event.get("tools").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            status.cloud = event
                .get("cloud")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            status.error = None;
        }
        Some("state") => {
            if let Some(value) = text("value") {
                status.state = value;
            }
        }
        Some("heard") => status.last_heard = text("text"),
        Some("reply") => {
            status.last_reply = text("text");
            status.via = text("via");
        }
        Some("error") => status.error = text("message"),
        Some("restarting") => status.restarting = true,
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;

    #[test]
    fn a_restarting_event_marks_the_status_so_the_exit_is_followed_by_a_start() {
        let status = Arc::new(Mutex::new(Status::default()));
        apply(&status, &serde_json::json!({ "type": "restarting" }));
        assert!(status.lock().unwrap().restarting);
    }

    #[test]
    fn agent_command_leaves_log_level_to_secrets_env() {
        let command = agent_command(&Settings {
            parlour_bin: "parlour".into(),
            autostart: false,
        });
        let forced: Vec<_> = command
            .get_envs()
            .filter(|(key, _)| *key == OsStr::new("LOG_LEVEL"))
            .collect();
        assert!(forced.is_empty(), "LOG_LEVEL must not be forced: {forced:?}");
        assert!(command.get_envs().any(|(key, _)| key == OsStr::new("PATH")));
        // The App Store build puts its own script first, for its own node.
        let args: Vec<_> = command.get_args().collect();
        assert_eq!(args[args.len() - 2..], ["start", "--events"]);
    }
}
