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
    out.extend(system_specs());
    #[cfg(target_os = "linux")]
    if nvidia_loaded() {
        out.push(format!("nvidia fast drawing: {}", if gpu_flag().exists() { "on (DMA-BUF renderer kept)" } else { "off (DMA-BUF renderer turned off)" }));
    }
    out.join("\n")
}

/// The machine, for lag reports (C5.7): CPU model and cores, memory, and on Linux the graphics drivers in use.
/// Read from the system's own files and tools; nothing about the user.
fn system_specs() -> Vec<String> {
    let mut out = Vec::new();
    let sysctl = |k: &str| std::process::Command::new("sysctl").args(["-n", k]).output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).filter(|s| !s.is_empty());
    if cfg!(target_os = "linux") {
        if let Ok(s) = std::fs::read_to_string("/proc/cpuinfo") {
            let model = s.lines().find(|l| l.starts_with("model name")).and_then(|l| l.split(':').nth(1)).map(|x| x.trim().to_string());
            let cores = s.lines().filter(|l| l.starts_with("processor")).count();
            if let Some(m) = model { out.push(format!("cpu: {} ({} threads)", m, cores)); }
        }
        if let Ok(s) = std::fs::read_to_string("/proc/meminfo") {
            if let Some(kb) = s.lines().find(|l| l.starts_with("MemTotal")).and_then(|l| l.split_whitespace().nth(1)).and_then(|x| x.parse::<u64>().ok()) {
                out.push(format!("memory: {} GB", (kb as f64 / 1048576.0).round()));
            }
        }
        // The kernel driver behind each graphics card (nvidia, amdgpu, i915...).
        let mut drivers: Vec<String> = Vec::new();
        if let Ok(dir) = std::fs::read_dir("/sys/class/drm") {
            for e in dir.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if !name.starts_with("card") || name.contains('-') { continue; }
                if let Ok(u) = std::fs::read_to_string(e.path().join("device/uevent")) {
                    if let Some(d) = u.lines().find(|l| l.starts_with("DRIVER=")) {
                        let d = d.trim_start_matches("DRIVER=").to_string();
                        if !drivers.contains(&d) { drivers.push(d); }
                    }
                }
            }
        }
        if !drivers.is_empty() { out.push(format!("graphics drivers: {}", drivers.join(", "))); }
    } else if cfg!(target_os = "macos") {
        if let Some(c) = sysctl("machdep.cpu.brand_string") { out.push(format!("cpu: {} ({} cores)", c, sysctl("hw.ncpu").unwrap_or_default())); }
        if let Some(m) = sysctl("hw.memsize").and_then(|x| x.parse::<u64>().ok()) { out.push(format!("memory: {} GB", m / 1073741824)); }
    } else if cfg!(target_os = "windows") {
        if let Ok(c) = std::env::var("PROCESSOR_IDENTIFIER") { out.push(format!("cpu: {} ({} threads)", c, std::env::var("NUMBER_OF_PROCESSORS").unwrap_or_default())); }
    }
    out
}

/// NVIDIA's driver is loaded (Linux).
#[cfg(target_os = "linux")]
fn nvidia_loaded() -> bool {
    std::path::Path::new("/proc/driver/nvidia").exists() || std::path::Path::new("/sys/module/nvidia").exists()
}

/// The "fast drawing on NVIDIA" switch (C5.4): a file in the app's config folder, read before the window exists.
#[cfg(target_os = "linux")]
fn gpu_flag() -> std::path::PathBuf {
    let base = std::env::var_os("XDG_CONFIG_HOME").map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".config")))
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"));
    base.join("soul-forge").join("nvidia-fast-drawing")
}

/// Turns the NVIDIA fast-drawing switch on or off; it takes effect at the next start.
#[tauri::command]
fn gpu_fast(on: bool) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let f = gpu_flag();
        if on {
            std::fs::create_dir_all(f.parent().unwrap()).map_err(|e| e.to_string())?;
            std::fs::write(&f, "on").map_err(|e| e.to_string())?;
        } else {
            let _ = std::fs::remove_file(&f);
            let _ = std::fs::remove_file(f.with_extension("trying"));
        }
    }
    let _ = on;
    Ok(())
}

/// Whether the switch applies here (Linux with NVIDIA) and whether it is on.
#[tauri::command]
fn gpu_status() -> (bool, bool) {
    #[cfg(target_os = "linux")]
    return (nvidia_loaded(), gpu_flag().exists());
    #[cfg(not(target_os = "linux"))]
    (false, false)
}

/// Called once the window has drawn: this start with fast drawing worked, so the next one may use it too.
#[tauri::command]
fn gpu_started() {
    #[cfg(target_os = "linux")]
    let _ = std::fs::remove_file(gpu_flag().with_extension("trying"));
}

fn main() {
    // WebKitGTK's DMA-BUF renderer fails on NVIDIA's driver under Wayland and the app quits before a window shows
    // (GitHub issue #1). Turned off only where NVIDIA's driver is loaded, unless the user has set the variable
    // themselves: elsewhere it is WebKitGTK's fast path, and turning it off everywhere made drawing slow (C5.4, Plasma).
    //
    // On NVIDIA the player can try the fast path anyway (Settings, "Fast drawing on NVIDIA"; newer drivers may cope).
    // A start that tries it leaves a "trying" mark the window clears once it has drawn; a mark still there at the next
    // start means that one never drew, so the switch goes off by itself and nobody is locked out.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() && nvidia_loaded() {
        let flag = gpu_flag();
        let trying = flag.with_extension("trying");
        let fast = flag.exists() && !trying.exists();
        if trying.exists() {
            let _ = std::fs::remove_file(&flag);
            let _ = std::fs::remove_file(&trying);
        }
        if fast {
            let _ = std::fs::write(&trying, "1");
        } else {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![install_kind, selftest_path, selftest_finish, diagnostics, gpu_fast, gpu_status, gpu_started])
        .run(tauri::generate_context!())
        .expect("error while running Soul Forge");
}
