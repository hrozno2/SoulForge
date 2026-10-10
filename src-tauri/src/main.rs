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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![install_kind, selftest_path, selftest_finish])
        .run(tauri::generate_context!())
        .expect("error while running Soul Forge");
}
