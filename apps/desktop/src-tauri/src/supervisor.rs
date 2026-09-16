use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::settings::Settings;

const LOG_LINES: usize = 400;

/// What the window draws. Every field but `running` comes from the agent's own
/// NDJSON events, so the app never has to guess at the agent's state from log
/// text.
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
                "No agent at {}. Set the agent directory in Settings.",
                settings.agent_dir
            ));
        }

        let mut child = Command::new(&settings.node_path)
            .current_dir(&settings.agent_dir)
            .args([
                "--experimental-strip-types",
                "--env-file-if-exists=.env",
                "src/index.ts",
            ])
            .env("AGENT_EVENTS", "1")
            .env("LOG_LEVEL", "info")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("could not start {}: {e}", settings.node_path))?;

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
                let mut status = status.lock().unwrap();
                status.running = false;
                status.state = "stopped".into();
                let _ = app.emit("agent://status", status.clone());
            }
        });
    }

    pub fn stop(&mut self) {
        let Some(child) = self.child.as_mut() else {
            return;
        };
        // SIGINT first: the agent shuts ffmpeg down on it, and a SIGKILL here
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

fn apply(status: &Arc<Mutex<Status>>, event: &serde_json::Value) {
    let mut status = status.lock().unwrap();
    let text = |key: &str| event.get(key).and_then(|v| v.as_str()).map(str::to_owned);
    match event.get("type").and_then(|v| v.as_str()) {
        Some("ready") => {
            status.running = true;
            status.tools = event.get("tools").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            status.cloud = event.get("cloud").and_then(|v| v.as_bool()).unwrap_or(false);
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
        _ => {}
    }
}
