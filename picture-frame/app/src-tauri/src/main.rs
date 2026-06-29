// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod memory;
mod musing;

use {
    log::{error, info, trace},
    memory::{fetch_all_memories_in_directory, Memory},
    musing::{fetch_all_musings_in_directory, Musings},
    notify::{Config, RecommendedWatcher, RecursiveMode, Watcher},
    tauri::Manager,
    tauri_plugin_log::LogTarget,
};

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([LogTarget::LogDir, LogTarget::Stdout, LogTarget::Webview])
                .build(),
        )
        .setup(|app| {
            let app = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                if let Err(err) = spawn_directory_watcher(app) {
                    error!("{}", err)
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_all_memories,
            fetch_all_musings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn fetch_all_memories<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<Vec<Memory>, String> {
    trace!("fetch_all_memories invoked");

    let app_data_dir = app
        .path_resolver()
        .app_data_dir()
        .ok_or("Failed to resolve $APPDATADIR")?;

    fetch_all_memories_in_directory(app_data_dir)
}

#[tauri::command]
fn fetch_all_musings<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<Musings, String> {
    trace!("fetch_all_musings invoked");

    let app_data_dir = app
        .path_resolver()
        .app_data_dir()
        .ok_or("Failed to resolve $APPDATADIR")?;

    fetch_all_musings_in_directory(app_data_dir)
}

fn spawn_directory_watcher<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    let app_data_dir = app
        .path_resolver()
        .app_data_dir()
        .ok_or("Failed to resolve $APPDATADIR")?;

    let (tx, rx) = std::sync::mpsc::channel();

    let mut watcher =
        RecommendedWatcher::new(tx, Config::default()).expect("Failed to create directory watcher");

    watcher
        .watch(app_data_dir.as_ref(), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch $APPDATADIR: {}", e))?;

    info!("Installed watcher for $APPDATADIR");

    for res in rx {
        match res {
            Ok(_) => {
                trace!("Entries updated for $APPDATADIR");
                let () = app
                    .emit_all("entries_changed", ())
                    .map_err(|e| format!("Failed to emit event: {}", e))?;
            }
            Err(e) => {
                error!("Failed to receive event from $APPDATADIR: {}", e);
                return Err(format!("Failed to receive event from $APPDATADIR: {}", e));
            }
        }
    }

    Ok(())
}
