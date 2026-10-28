#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// How this copy of Soul Forge was installed, so the UI knows how updates work.
///
/// - `app`: Windows installer or macOS app. The in-app updater replaces the files.
/// - `appimage`: Linux AppImage. The in-app updater replaces the AppImage.
/// - `package-arch`: installed through pacman. Only the package manager should update it.
/// - `package`: another Linux package (deb, rpm). Update by installing the newer package.
#[tauri::command]
fn install_kind() -> String {
    if cfg!(target_os = "linux") {
        if std::env::var_os("APPIMAGE").is_some() {
            return "appimage".into();
        }
        let release = std::fs::read_to_string("/etc/os-release").unwrap_or_default().to_lowercase();
        let arch_like = release
            .lines()
            .filter(|l| l.starts_with("id=") || l.starts_with("id_like="))
            .any(|l| l.contains("arch") || l.contains("cachyos"));
        return if arch_like { "package-arch".into() } else { "package".into() };
    }
    "app".into()
}

/// Where a self-test report should go. Set only when a developer or CI starts the app with SOULFORGE_SELFTEST.
#[tauri::command]
fn selftest_path() -> Option<String> {
    std::env::var("SOULFORGE_SELFTEST").ok().filter(|p| !p.is_empty())
}

/// Writes the self-test report and quits, so a script can run the real app and read the result.
#[tauri::command]
fn selftest_finish(report: String) {
    if let Some(path) = selftest_path() {
        let _ = std::fs::write(path, report);
        std::process::exit(0);
    }
}

/// What a bug report needs to know about the system (GitHub issue #4): the OS, and on Linux the session, desktop,
/// distribution and NVIDIA driver, which decide whether WebKitGTK starts. No user names or paths.
#[tauri::command]
fn diagnostics() -> String {
    let mut out = vec![format!("os: {} {}", std::env::consts::OS, std::env::consts::ARCH)];
    for k in ["XDG_SESSION_TYPE", "XDG_CURRENT_DESKTOP", "DESKTOP_SESSION", "WEBKIT_DISABLE_DMABUF_RENDERER", "WEBKIT_DISABLE_COMPOSITING_MODE"] {
        if let Ok(v) = std::env::var(k) {
            out.push(format!("{}: {}", k, v));
        }
    }
    if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        out.push("WAYLAND_DISPLAY: set".into());
    }
    if let Ok(s) = std::fs::read_to_string("/etc/os-release") {
        if let Some(l) = s.lines().find(|l| l.starts_with("PRETTY_NAME=")) {
            out.push(format!("distribution: {}", l.trim_start_matches("PRETTY_NAME=").trim_matches('"')));
        }
    }
    if let Ok(s) = std::fs::read_to_string("/proc/driver/nvidia/version") {
        if let Some(l) = s.lines().next() {
            out.push(format!("nvidia: {}", l.trim()));
        }
    }
    out.join("\n")
}

fn main() {
    // WebKitGTK's DMA-BUF renderer fails on NVIDIA's driver under Wayland and the app quits before a window shows
    // (GitHub issue #1). Turned off only where NVIDIA's driver is loaded, unless the user has set the variable
    // themselves: elsewhere it is WebKitGTK's fast path, and turning it off everywhere made drawing slow (C5.4, Plasma).
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
        && (std::path::Path::new("/proc/driver/nvidia").exists() || std::path::Path::new("/sys/module/nvidia").exists())
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![install_kind, selftest_path, selftest_finish, diagnostics])
        .run(tauri::generate_context!())
        .expect("error while running Soul Forge");
}
