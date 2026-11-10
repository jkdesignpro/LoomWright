// LoomWright desktop shell: native file dialogs and file access for the editor.
// Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later

use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};
#[cfg(any(target_os = "macos", target_os = "ios"))]
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
struct Opened {
    name: String,
    path: String,
    text: String,
}

#[derive(Serialize)]
struct Saved {
    name: String,
    path: String,
}

fn file_name(p: &PathBuf) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn read_opened(p: PathBuf) -> Result<Opened, String> {
    let text = fs::read_to_string(&p).map_err(|e| format!("Could not read {}: {e}", p.display()))?;
    Ok(Opened { name: file_name(&p), path: p.to_string_lossy().into_owned(), text })
}

#[tauri::command]
async fn open_diagram(app: AppHandle) -> Result<Option<Opened>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("LoomWright diagram", &["loom", "json"])
        .blocking_pick_file();
    match picked {
        Some(fp) => read_opened(fp.into_path().map_err(|e| e.to_string())?).map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
async fn open_text(app: AppHandle, filter_name: String, extensions: Vec<String>) -> Result<Option<Opened>, String> {
    let exts: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    let picked = app.dialog().file().add_filter(&filter_name, &exts).blocking_pick_file();
    match picked {
        Some(fp) => read_opened(fp.into_path().map_err(|e| e.to_string())?).map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn file_mtime(path: String) -> Result<u64, String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    let t = meta.modified().map_err(|e| e.to_string())?;
    Ok(t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
}

/// Write atomically so a reader (such as the Claude add-on) never sees half a file.
fn write_atomic(path: &PathBuf, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("loomwright-tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_diagram(app: AppHandle, path: Option<String>, contents: String, suggested: String) -> Result<Option<Saved>, String> {
    let target = match path {
        Some(p) => Some(PathBuf::from(p)),
        None => app
            .dialog()
            .file()
            .add_filter("LoomWright diagram", &["loom"])
            .set_file_name(&suggested)
            .blocking_save_file()
            .map(|fp| fp.into_path())
            .transpose()
            .map_err(|e| e.to_string())?,
    };
    match target {
        Some(p) => {
            write_atomic(&p, contents.as_bytes())?;
            Ok(Some(Saved { name: file_name(&p), path: p.to_string_lossy().into_owned() }))
        }
        None => Ok(None),
    }
}

#[tauri::command]
async fn export_file(app: AppHandle, suggested: String, extension: String, data_b64: String) -> Result<Option<Saved>, String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data_b64).map_err(|e| e.to_string())?;
    let label = format!("{} file", extension.to_uppercase());
    let picked = app
        .dialog()
        .file()
        .add_filter(&label, &[extension.as_str()])
        .set_file_name(&suggested)
        .blocking_save_file();
    match picked {
        Some(fp) => {
            let p = fp.into_path().map_err(|e| e.to_string())?;
            write_atomic(&p, &bytes)?;
            Ok(Some(Saved { name: file_name(&p), path: p.to_string_lossy().into_owned() }))
        }
        None => Ok(None),
    }
}

/// Portable mode: an empty file named `portable` next to the program keeps
/// My components, settings and autosaved work in a `LoomWright-data` folder
/// beside it instead of the user's profile, so LoomWright can run from a USB stick.
fn portable_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    if dir.join("portable").exists() || dir.join("portable.txt").exists() {
        Some(dir.join("LoomWright-data"))
    } else {
        None
    }
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = match portable_dir() {
        Some(d) => d,
        None => app.path().app_data_dir().map_err(|e| e.to_string())?,
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn library_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("library.json"))
}

#[derive(Serialize)]
struct AppInfo {
    portable: bool,
    data_dir: String,
    library: String,
}

/// Where this copy keeps its data, shown in Help > About.
#[tauri::command]
fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    let dir = data_dir(&app)?;
    Ok(AppInfo { portable: portable_dir().is_some(), library: dir.join("library.json").to_string_lossy().into_owned(), data_dir: dir.to_string_lossy().into_owned() })
}

#[tauri::command]
fn load_user_library(app: AppHandle) -> Result<Option<String>, String> {
    let p = library_path(&app)?;
    if !p.exists() {
        return Ok(None);
    }
    fs::read_to_string(p).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_user_library(app: AppHandle, contents: String) -> Result<(), String> {
    let p = library_path(&app)?;
    write_atomic(&p, contents.as_bytes())
}

/// Files the system has asked LoomWright to open and the editor has not taken yet:
/// a .loom file passed on the command line (Windows and Linux file association),
/// or one opened from Finder (macOS, which sends an "opened" event instead).
#[derive(Default)]
struct PendingFiles(Mutex<Vec<PathBuf>>);

fn is_diagram(p: &PathBuf) -> bool {
    matches!(p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(), Some("loom") | Some("json"))
}

/// Hands each waiting file to the editor once.
#[tauri::command]
fn opened_files(pending: tauri::State<'_, PendingFiles>) -> Vec<Opened> {
    let list = pending.0.lock().map(|mut v| std::mem::take(&mut *v)).unwrap_or_default();
    list.into_iter().filter_map(|p| read_opened(p).ok()).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // In portable mode the Windows web view keeps its storage (settings, autosave) beside the program too.
    #[cfg(windows)]
    if let Some(d) = portable_dir() {
        let web = d.join("webview");
        if fs::create_dir_all(&web).is_ok() {
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", web);
        }
    }
    let from_args: Vec<PathBuf> = std::env::args().skip(1).map(PathBuf::from).filter(is_diagram).collect();
    let app = tauri::Builder::default()
        .manage(PendingFiles(Mutex::new(from_args)))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_diagram,
            open_text,
            read_text,
            file_mtime,
            save_diagram,
            export_file,
            load_user_library,
            save_user_library,
            opened_files,
            app_info
        ])
        .build(tauri::generate_context!())
        .expect("error while starting LoomWright");
    app.run(|handle, event| {
        // macOS: double-clicking a .loom file, or dropping it on the Dock icon.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = &event {
            let files: Vec<PathBuf> = urls.iter().filter_map(|u| u.to_file_path().ok()).filter(is_diagram).collect();
            if !files.is_empty() {
                if let Ok(mut v) = handle.state::<PendingFiles>().0.lock() {
                    v.extend(files);
                }
                // If the editor is already running it collects them now; if not,
                // it collects them when it starts.
                let _ = handle.emit("files-waiting", ());
            }
        }
        let _ = (handle, event);
    });
}
