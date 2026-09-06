// The window is the only user interface; nothing prints to a console.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod settings;
mod setup;
mod supervisor;

use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

use settings::{found, Settings};
use setup::Readiness;
use supervisor::{Status, Supervisor};

/// The app owns two things: where the agent is, and the process itself. Its
/// configuration is deliberately not a second copy of the agent's own, which
/// stays the file the agent reads and this app edits in place.
struct AppState {
    supervisor: Mutex<Supervisor>,
    settings: Mutex<Settings>,
    settings_path: PathBuf,
}

impl AppState {
    fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }

    fn agent_path(&self, file: &str) -> PathBuf {
        PathBuf::from(self.settings().agent_dir).join(file)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Network {
    /// What to type into a phone, or point Home Assistant at.
    url: String,
    /// Without a token the agent answers loopback only, so nothing else can reach it.
    token_set: bool,
    port: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SecretsPresent {
    ha_token: bool,
    anthropic_key: bool,
    brave_key: bool,
    agent_token: bool,
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
fn set_settings(state: State<'_, AppState>, next: Settings) -> Result<Settings, String> {
    next.save(&state.settings_path)?;
    *state.settings.lock().unwrap() = next.clone();
    Ok(next)
}

#[tauri::command]
fn status(state: State<'_, AppState>) -> Status {
    let mut supervisor = state.supervisor.lock().unwrap();
    let running = supervisor.running();
    let mut status = supervisor.status.lock().unwrap().clone();
    // The process can die between events, so trust the process over the flag.
    if !running {
        status.running = false;
        status.state = "stopped".into();
    }
    status
}

#[tauri::command]
fn start_agent(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let settings = state.settings();
    state.supervisor.lock().unwrap().start(&app, &settings)
}

#[tauri::command]
fn stop_agent(app: AppHandle, state: State<'_, AppState>) {
    state.supervisor.lock().unwrap().stop();
    let _ = app.emit("agent://status", status(state));
}

#[tauri::command]
fn logs(state: State<'_, AppState>) -> Vec<String> {
    let supervisor = state.supervisor.lock().unwrap();
    let logs = supervisor.logs.lock().unwrap();
    logs.iter().cloned().collect()
}

#[tauri::command]
fn read_agent_config(state: State<'_, AppState>) -> Result<String, String> {
    let path = state.agent_path("agent.config.json");
    match std::fs::read_to_string(&path) {
        Ok(raw) => Ok(raw),
        // A missing config is the normal first-run state, not an error: the
        // example is what the installer starts from too.
        Err(_) => std::fs::read_to_string(state.agent_path("agent.config.example.json"))
            .map_err(|e| format!("{}: {e}", path.display())),
    }
}

#[tauri::command]
fn write_agent_config(state: State<'_, AppState>, json: String) -> Result<(), String> {
    // Parse before writing: a config the agent cannot read is worse than one
    // that is out of date, because it fails at the next start rather than now.
    let parsed: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let pretty = serde_json::to_string_pretty(&parsed).map_err(|e| e.to_string())?;
    std::fs::write(state.agent_path("agent.config.json"), pretty + "\n").map_err(|e| e.to_string())
}

#[tauri::command]
fn secrets_present(state: State<'_, AppState>) -> SecretsPresent {
    let env = std::fs::read_to_string(state.agent_path(".env")).unwrap_or_default();
    let set = |key: &str| {
        env.lines()
            .filter_map(|line| line.split_once('='))
            .any(|(k, v)| k.trim() == key && !v.trim().is_empty())
    };
    SecretsPresent {
        ha_token: set("HA_TOKEN"),
        anthropic_key: set("ANTHROPIC_API_KEY"),
        brave_key: set("BRAVE_API_KEY"),
        agent_token: set("AGENT_TOKEN"),
    }
}

/// Only the keys that were typed into are changed, so an empty box means
/// "leave it alone" rather than "delete it".
#[tauri::command]
fn write_secrets(
    state: State<'_, AppState>,
    ha_token: Option<String>,
    anthropic_key: Option<String>,
    brave_key: Option<String>,
    agent_token: Option<String>,
) -> Result<(), String> {
    let path = state.agent_path(".env");
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let updates = [
        ("HA_TOKEN", ha_token),
        ("ANTHROPIC_API_KEY", anthropic_key),
        ("BRAVE_API_KEY", brave_key),
        ("AGENT_TOKEN", agent_token),
    ];

    let mut lines: Vec<String> = existing.lines().map(str::to_owned).collect();
    for (key, value) in updates {
        let Some(value) = value else { continue };
        let line = format!("{key}={value}");
        match lines
            .iter()
            .position(|l| l.split_once('=').is_some_and(|(k, _)| k.trim() == key))
        {
            Some(index) => lines[index] = line,
            None => lines.push(line),
        }
    }

    std::fs::write(&path, lines.join("\n") + "\n").map_err(|e| e.to_string())?;
    // The Home Assistant token is the whole house. It is not world readable.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Where the rest of the house should point. The hostname comes from the
/// machine rather than the config, because that is the part a person has to
/// type into a phone and the part they always get wrong.
#[tauri::command]
fn network(state: State<'_, AppState>) -> Network {
    let config: serde_json::Value = read_agent_config(state.clone())
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or(serde_json::Value::Null);
    let port = config
        .get("server")
        .and_then(|s| s.get("port"))
        .and_then(|p| p.as_u64())
        .unwrap_or(8765) as u16;

    let host = Command::new("hostname")
        .output()
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "localhost".into());

    let env = std::fs::read_to_string(state.agent_path(".env")).unwrap_or_default();
    let token_set = env
        .lines()
        .filter_map(|line| line.split_once('='))
        .any(|(k, v)| k.trim() == "AGENT_TOKEN" && !v.trim().is_empty());

    Network {
        url: format!("http://{host}:{port}"),
        token_set,
        port,
    }
}

/// The household's connected accounts, read and written through the agent's
/// own `connectors` command so the app and the terminal cannot disagree.
#[tauri::command]
async fn connectors(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let output = agent_command(&state, &["src/connectors/cli.ts", "list", "--json"])
        .await?
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .rev()
        .find(|line| line.starts_with('['))
        .ok_or_else(|| String::from_utf8_lossy(&output.stderr).trim().to_string())?;
    serde_json::from_str(line).map_err(|e| e.to_string())
}

/// Starts a sign in. The browser opens, the agent's loopback listener catches
/// the redirect, and the tokens land in the Keychain; this returns as soon as
/// the flow is under way rather than waiting for a person to finish typing
/// their password.
#[tauri::command]
fn connector_add(state: State<'_, AppState>, name: String, url: String, scope: Option<String>) -> Result<(), String> {
    if name.is_empty() || url.is_empty() {
        return Err("a name and a URL are needed".into());
    }
    let settings = state.settings();
    let mut args = vec![
        "--experimental-strip-types".to_string(),
        "--env-file-if-exists=.env".to_string(),
        "src/connectors/cli.ts".to_string(),
        "add".to_string(),
        name,
        url,
    ];
    if let Some(scope) = scope.filter(|s| !s.is_empty()) {
        args.push(format!("--scope={scope}"));
    }
    Command::new(&settings.node_path)
        .current_dir(&settings.agent_dir)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn connector_remove(state: State<'_, AppState>, name: String) -> Result<(), String> {
    agent_command(&state, &["src/connectors/cli.ts", "remove", &name])
        .await?
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Runs one of the agent's own scripts and waits for it.
async fn agent_command(
    state: &State<'_, AppState>,
    args: &[&str],
) -> Result<std::io::Result<std::process::Output>, String> {
    let settings = state.settings();
    let owned: Vec<String> = args.iter().map(|a| a.to_string()).collect();
    tauri::async_runtime::spawn_blocking(move || {
        Command::new(&settings.node_path)
            .current_dir(&settings.agent_dir)
            .arg("--experimental-strip-types")
            .arg("--env-file-if-exists=.env")
            .args(&owned)
            .output()
    })
    .await
    .map_err(|e| e.to_string())
}

/// Runs the agent's own doctor rather than reimplementing its checks here, so
/// the app and the terminal always agree about what is broken.
#[tauri::command]
async fn run_doctor(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let settings = state.settings();
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new(&settings.node_path)
            .current_dir(&settings.agent_dir)
            .args([
                "--experimental-strip-types",
                "--env-file-if-exists=.env",
                "src/doctor.ts",
                "--json",
            ])
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .rev()
        .find(|line| line.starts_with('['))
        .ok_or_else(|| String::from_utf8_lossy(&output.stderr).trim().to_string())?;
    serde_json::from_str(line).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Microphone {
    granted: bool,
    detail: String,
}

/// macOS asks about the microphone once, and only when something actually opens
/// it. Recording a fraction of a second is what makes the prompt appear, and
/// because ffmpeg is a child of this app the permission granted is this app's,
/// which is the one the agent inherits when the app starts it.
///
/// This blocks for as long as the prompt is on screen, which is the point: the
/// answer is the return value.
#[tauri::command]
async fn microphone_check(device: Option<String>) -> Microphone {
    let Some(ffmpeg) = found("ffmpeg") else {
        return Microphone {
            granted: false,
            detail: "ffmpeg is not installed yet, and it is what opens the microphone".into(),
        };
    };
    let device = device.filter(|d| !d.is_empty()).unwrap_or_else(|| ":0".into());

    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new(ffmpeg)
            .args([
                "-hide_banner",
                "-nostdin",
                "-f",
                "avfoundation",
                "-i",
                &device,
                "-t",
                "0.4",
                "-f",
                "null",
                "-",
            ])
            .output()
    })
    .await;

    let Ok(Ok(output)) = output else {
        return Microphone {
            granted: false,
            detail: "could not run ffmpeg".into(),
        };
    };
    if output.status.success() {
        return Microphone {
            granted: true,
            detail: "the microphone answered".into(),
        };
    }

    // ffmpeg says a great deal; the last line it managed is the useful part.
    let stderr = String::from_utf8_lossy(&output.stderr);
    let detail = stderr
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("the microphone did not open")
        .trim()
        .to_owned();
    Microphone {
        granted: false,
        detail,
    }
}

/// Straight to the Privacy pane, for when the answer was no and the only way
/// back is a checkbox in System Settings.
#[tauri::command]
fn open_privacy_settings() {
    let _ = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
        .spawn();
}

/// What the onboarding draws: which pieces are in place and which are not.
#[tauri::command]
fn setup_status(state: State<'_, AppState>) -> Readiness {
    setup::inspect(&state.settings())
}

/// Installs everything that needs no answer, reporting as it goes. The work is
/// the agent's own setup script, so the app and a terminal do the same thing.
#[tauri::command]
async fn run_setup(app: AppHandle, state: State<'_, AppState>, wake_word: Option<String>) -> Result<bool, String> {
    let settings = state.settings();
    tauri::async_runtime::spawn_blocking(move || setup::run(&app, &settings, wake_word))
        .await
        .map_err(|e| e.to_string())?
}

/// ffmpeg lists avfoundation devices on stderr and exits non-zero. That is
/// normal, which is why the exit status is ignored.
#[tauri::command]
async fn audio_devices() -> Vec<String> {
    let output = tauri::async_runtime::spawn_blocking(|| {
        Command::new("ffmpeg")
            .args(["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""])
            .output()
    })
    .await;

    let Ok(Ok(output)) = output else {
        return Vec::new();
    };
    let text = String::from_utf8_lossy(&output.stderr).into_owned();
    let mut devices = Vec::new();
    let mut in_audio = false;
    for line in text.lines() {
        if line.contains("AVFoundation audio devices") {
            in_audio = true;
            continue;
        }
        if line.contains("AVFoundation video devices") {
            in_audio = false;
            continue;
        }
        if in_audio {
            if let Some(start) = line.rfind("] [") {
                devices.push(line[start + 2..].trim().to_string());
            }
        }
    }
    devices
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // A menu bar app, so no Dock icon and no menu bar of its own. The
            // tray is the way back to the window, which is why closing the
            // window only hides it.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let settings_path = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("settings.json");
            let settings = Settings::load(&settings_path);

            app.manage(AppState {
                supervisor: Mutex::new(Supervisor::default()),
                settings: Mutex::new(settings),
                settings_path,
            });

            let show = MenuItem::with_id(app, "show", "Open", true, None::<&str>)?;
            let start = MenuItem::with_id(app, "start", "Start listening", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Stop", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &start, &stop, &quit])?;

            // Nothing activates an Accessory app for you, so a window that is
            // meant to be seen at launch has to ask.
            if let Some(window) = app.get_webview_window("main") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.set_focus();
                }
            }

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .tooltip("Home agent")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let state = app.state::<AppState>();
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "start" => {
                            let settings = state.settings();
                            if let Err(error) =
                                state.supervisor.lock().unwrap().start(app, &settings)
                            {
                                let _ = app.emit("agent://error", error);
                            }
                        }
                        "stop" => state.supervisor.lock().unwrap().stop(),
                        "quit" => {
                            // Stop the agent first, or the microphone stays
                            // held by an orphaned ffmpeg.
                            state.supervisor.lock().unwrap().stop();
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides it. The agent is meant to keep
            // listening, and a menu bar app with no window is the normal state.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_settings,
            status,
            start_agent,
            stop_agent,
            logs,
            read_agent_config,
            write_agent_config,
            secrets_present,
            write_secrets,
            run_doctor,
            setup_status,
            run_setup,
            microphone_check,
            open_privacy_settings,
            audio_devices,
            network,
            connectors,
            connector_add,
            connector_remove,
        ])
        .run(tauri::generate_context!())
        .expect("could not start the app");
}
