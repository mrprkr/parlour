//! Opening at login, for the App Store build. A LaunchAgent is what the
//! terminal install uses, but a sandboxed app may not write one; SMAppService
//! is the way Apple allows, and it shows in System Settings under Login Items
//! where the person can turn it off without this app. Elsewhere this is not
//! offered, which the window reads as `None`.

#[cfg(all(feature = "appstore", target_os = "macos"))]
mod imp {
    use objc2_service_management::{SMAppService, SMAppServiceStatus};

    pub fn enabled() -> Option<bool> {
        // SAFETY: mainAppService and status take no arguments and are safe to
        // call from any thread on macOS 13, which the App Store build requires.
        let service = unsafe { SMAppService::mainAppService() };
        Some(unsafe { service.status() } == SMAppServiceStatus::Enabled)
    }

    pub fn set(on: bool) -> Result<bool, String> {
        // SAFETY: as above; the error is returned rather than thrown.
        let service = unsafe { SMAppService::mainAppService() };
        let result = if on {
            unsafe { service.registerAndReturnError() }
        } else {
            unsafe { service.unregisterAndReturnError() }
        };
        result.map_err(|error| error.localizedDescription().to_string())?;
        Ok(enabled().unwrap_or(false))
    }
}

#[cfg(not(all(feature = "appstore", target_os = "macos")))]
mod imp {
    pub fn enabled() -> Option<bool> {
        None
    }

    pub fn set(_on: bool) -> Result<bool, String> {
        Err("Opening at login is only offered by the App Store build.".into())
    }
}

/// Whether the app opens at login, or `None` where the choice is not offered.
#[tauri::command]
pub fn login_item() -> Option<bool> {
    imp::enabled()
}

#[tauri::command]
pub fn set_login_item(enabled: bool) -> Result<bool, String> {
    imp::set(enabled)
}
