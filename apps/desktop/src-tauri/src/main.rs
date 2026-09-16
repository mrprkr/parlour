// The window is the only user interface; nothing prints to a console.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod settings;
mod setup;
mod supervisor;

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

use settings::{detect_parlour, found, shell_path, Settings};
use setup::Readiness;
use supervisor::{Status, Supervisor};

/// The app owns two things: where `parlour` is, and the process itself. Its
/// configuration is deliberately not a second copy of Parlour's own, which
/// stays the file the CLI reads and this app edits through the CLI.
struct AppState {
    supervisor: Mutex<Supervisor>,
    settings: Mutex<Settings>,
    settings_path: PathBuf,
}

impl AppState {
    fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }
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

/// What running the CLI produced. The exit code is handed back rather than
/// turned into an error here, because what it means depends on the command:
/// `doctor` exits 1 to say there is something to fix, and its list is the
/// point. The window's typed wrappers know each command's contract.
#[derive(Serialize)]
struct CliOutput {
    code: i32,
    stdout: String,
    stderr: String,
}

/// Runs `parlour` with these arguments. This is how the window reads and
/// writes everything that is Parlour's rather than the app's: `config show
/// --json`, `secrets set`, `doctor --json`, `connectors list`. The one
/// command means the app and the terminal cannot disagree about a setting,
/// because there is only the CLI's idea of it. `stdin` is for the commands
/// that take a document or a secret that way rather than on the command line,
/// where it would show in a process listing. An error here is the CLI not
/// running at all, never the CLI saying no.
#[tauri::command]
async fn parlour(
    state: State<'_, AppState>,
    args: Vec<String>,
    stdin: Option<String>,
) -> Result<CliOutput, String> {
    let settings = state.settings();
    if !settings.looks_valid() {
        return Err(format!(
            "No parlour at {:?}. Install it, or say where it is in Settings.",
            settings.parlour_bin
        ));
    }
    let output =
        tauri::async_runtime::spawn_blocking(move || -> std::io::Result<std::process::Output> {
            let mut child = Command::new(&settings.parlour_bin)
                .args(&args)
                .env("PATH", shell_path())
                .stdin(if stdin.is_some() {
                    Stdio::piped()
                } else {
                    Stdio::null()
                })
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()?;
            if let Some(text) = stdin {
                // Written on its own thread so a command that answers before it
                // has read everything cannot leave this end blocked on a full pipe.
                if let Some(mut pipe) = child.stdin.take() {
                    std::thread::spawn(move || {
                        let _ = pipe.write_all(text.as_bytes());
                    });
                }
            }
            child.wait_with_output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("could not run parlour: {e}"))?;

    Ok(CliOutput {
        // None is a signal, which for a command the window asked for is
        // as good as a failure.
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

/// The machine's name, which is what a phone has to be told and what a
/// person always gets wrong. The port comes from the config, via the CLI.
#[tauri::command]
fn host_name() -> String {
    Command::new("hostname")
        .output()
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "localhost".into())
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
/// which is the one Parlour inherits when the app starts it.
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
    let device = device
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| ":0".into());

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
/// A stored path is only kept while it works: an install that moved, or a
/// fresh `npm install -g`, is found again here rather than typed in.
#[tauri::command]
async fn setup_status(state: State<'_, AppState>) -> Result<Readiness, String> {
    let stored = state.settings();
    // A login shell and several short commands, so off the main thread the
    // way the rest are.
    let (settings, readiness) = tauri::async_runtime::spawn_blocking(move || {
        let mut settings = stored;
        if !settings.looks_valid() {
            if let Some(path) = detect_parlour() {
                settings.parlour_bin = path.to_string_lossy().into_owned();
            }
        }
        let readiness = setup::inspect(&settings);
        (settings, readiness)
    })
    .await
    .map_err(|e| e.to_string())?;

    if settings.parlour_bin != state.settings().parlour_bin {
        settings.save(&state.settings_path)?;
        *state.settings.lock().unwrap() = settings;
    }
    Ok(readiness)
}

/// Installs everything that needs no answer, reporting as it goes. The work is
/// `parlour init`, so the app and a terminal do the same thing.
#[tauri::command]
async fn run_setup(app: AppHandle, state: State<'_, AppState>, deps: bool) -> Result<bool, String> {
    let settings = state.settings();
    tauri::async_runtime::spawn_blocking(move || setup::run(&app, &settings, deps))
        .await
        .map_err(|e| e.to_string())?
}

/// `npm install -g parlour` at this app's version, streamed like the setup.
#[tauri::command]
async fn install_cli(app: AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        setup::install_cli(&app, env!("CARGO_PKG_VERSION"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// ffmpeg lists avfoundation devices on stderr and exits non-zero. That is
/// normal, which is why the exit status is ignored. Looked up by path rather
/// than by name: an app opened from the Finder inherits a PATH without
/// Homebrew on it, and a bare `ffmpeg` would then find nothing.
#[tauri::command]
async fn audio_devices() -> Vec<String> {
    let Some(ffmpeg) = found("ffmpeg") else {
        return Vec::new();
    };
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new(ffmpeg)
            .args([
                "-hide_banner",
                "-f",
                "avfoundation",
                "-list_devices",
                "true",
                "-i",
                "",
            ])
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

            let autostart = settings.autostart;
            app.manage(AppState {
                supervisor: Mutex::new(Supervisor::default()),
                settings: Mutex::new(settings),
                settings_path,
            });

            // Listening from the moment the app opens, for the machine where
            // the app is what keeps Parlour running rather than launchd. An
            // error here is the same one the Start button would show.
            if autostart {
                let state = app.state::<AppState>();
                let settings = state.settings();
                let started = state
                    .supervisor
                    .lock()
                    .unwrap()
                    .start(app.handle(), &settings);
                if let Err(error) = started {
                    let _ = app.emit("agent://error", error);
                }
            }

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
                .tooltip("Parlour")
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
                            // Stop Parlour first, or the microphone stays
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
            // Closing the window hides it. Parlour is meant to keep
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
            parlour,
            host_name,
            setup_status,
            run_setup,
            install_cli,
            microphone_check,
            open_privacy_settings,
            audio_devices,
        ])
        .run(tauri::generate_context!())
        .expect("could not start the app");
}
