use anyhow::{Context, Result};
use axum::{
    extract::{DefaultBodyLimit, Multipart, Query, State},
    http::{header, StatusCode, Uri},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

#[derive(RustEmbed)]
#[folder = "dist"]
struct Assets;

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "heic", "heif", "tiff", "gif", "webp"];
const PREVIEWABLE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp"];

#[derive(Deserialize, Clone)]
struct OrcConfig {
    #[allow(dead_code)]
    user: String,
    #[allow(dead_code)]
    host: String,
    source: String,
    #[allow(dead_code)]
    staging: String,
    #[allow(dead_code)]
    destination: String,
    #[allow(dead_code)]
    repo: String,
}

#[derive(Serialize, Deserialize)]
struct FrameState {
    active_directory: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SyncStatus {
    running: bool,
    last_error: Option<String>,
}

#[derive(Serialize)]
struct DirNode {
    name: String,
    path: String,
    image_count: usize,
    children: Vec<DirNode>,
}

#[derive(Serialize)]
struct FileInfo {
    name: String,
    path: String,
    size: u64,
    previewable: bool,
}

#[derive(Clone)]
struct AppState {
    config: Arc<OrcConfig>,
    sync_status: Arc<Mutex<SyncStatus>>,
}

fn curator_config_path() -> Result<PathBuf> {
    dirs::home_dir()
        .context("cannot find home dir")
        .map(|b| b.join(".curator.toml"))
}

fn state_file_path() -> Result<PathBuf> {
    dirs::config_dir()
        .context("cannot find config dir")
        .map(|b| b.join("twyk/digital-frame/frame-controller.json"))
}

fn read_frame_state() -> Result<FrameState> {
    let path = state_file_path()?;
    if !path.exists() {
        return Ok(FrameState { active_directory: None });
    }
    let raw = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&raw)?)
}

fn write_frame_state(s: &FrameState) -> Result<()> {
    let path = state_file_path()?;
    std::fs::create_dir_all(path.parent().unwrap())?;
    std::fs::write(&path, serde_json::to_string_pretty(s)?)?;
    Ok(())
}

fn build_tree(path: &Path) -> Result<DirNode> {
    let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let path_str = path.to_string_lossy().into_owned();
    let mut image_count = 0usize;
    let mut children = Vec::new();

    if let Ok(rd) = std::fs::read_dir(path) {
        let mut entries: Vec<_> = rd.filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let ep = entry.path();
            if entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            if ep.is_dir() {
                children.push(build_tree(&ep)?);
            } else if ep.is_file() {
                let ext = ep.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                    image_count += 1;
                }
            }
        }
    }

    Ok(DirNode { name, path: path_str, image_count, children })
}

fn validate_under_source(path: &Path, source: &Path) -> Result<(), ApiError> {
    if !path.starts_with(source) {
        Err(err400("path must be under source directory"))
    } else {
        Ok(())
    }
}

type ApiError = (StatusCode, Json<Value>);

fn err500(e: anyhow::Error) -> ApiError {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
}

fn err400(msg: &str) -> ApiError {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": msg })))
}

async fn get_tree(State(state): State<AppState>) -> Result<Json<DirNode>, ApiError> {
    let source = state.config.source.clone();
    tokio::task::spawn_blocking(move || build_tree(Path::new(&source)))
        .await
        .map_err(|e| err500(anyhow::anyhow!(e)))?
        .map(Json)
        .map_err(err500)
}

async fn get_state(_: State<AppState>) -> Result<Json<FrameState>, ApiError> {
    read_frame_state().map(Json).map_err(err500)
}

#[derive(Deserialize)]
struct SetStateBody {
    active_directory: String,
}

async fn post_state(
    State(state): State<AppState>,
    Json(body): Json<SetStateBody>,
) -> impl IntoResponse {
    let proposed = PathBuf::from(&body.active_directory);
    let source = PathBuf::from(&state.config.source);
    if !proposed.starts_with(&source) {
        return err400("active_directory must be under config source").into_response();
    }
    if !proposed.is_dir() {
        return err400("active_directory does not exist on disk").into_response();
    }
    match write_frame_state(&FrameState { active_directory: Some(body.active_directory) }) {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => err500(e).into_response(),
    }
}

async fn post_sync(State(state): State<AppState>) -> impl IntoResponse {
    {
        let mut status = state.sync_status.lock().unwrap();
        if status.running {
            return (StatusCode::CONFLICT, Json(json!({ "error": "sync already running" }))).into_response();
        }
        status.running = true;
        status.last_error = None;
    }

    let active_dir = match read_frame_state().ok().and_then(|s| s.active_directory) {
        Some(d) => d,
        None => {
            state.sync_status.lock().unwrap().running = false;
            return err400("no active_directory set — call POST /api/state first").into_response();
        }
    };

    let sync_status = Arc::clone(&state.sync_status);
    tokio::spawn(async move {
        let result = tokio::process::Command::new("curator")
            .arg("sync")
            .arg("--directory")
            .arg(&active_dir)
            .status()
            .await;

        let mut s = sync_status.lock().unwrap();
        s.running = false;
        s.last_error = match result {
            Ok(exit) if exit.success() => None,
            Ok(exit) => Some(format!("curator exited with status {exit}")),
            Err(e) => Some(format!("failed to spawn curator: {e}")),
        };
    });

    (StatusCode::ACCEPTED, Json(json!({ "status": "started" }))).into_response()
}

async fn get_sync_status(State(state): State<AppState>) -> Json<SyncStatus> {
    Json(state.sync_status.lock().unwrap().clone())
}

async fn list_files(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let dir_str = match params.get("dir") {
        Some(d) => d.clone(),
        None => return err400("missing dir param").into_response(),
    };
    let dir = PathBuf::from(&dir_str);
    let source = PathBuf::from(&state.config.source);
    if let Err(e) = validate_under_source(&dir, &source) {
        return e.into_response();
    }

    let result = tokio::task::spawn_blocking(move || {
        let mut files = Vec::new();
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_file() { continue; }
            if path.file_name().unwrap_or_default().to_string_lossy().starts_with('.') { continue; }
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if !IMAGE_EXTENSIONS.contains(&ext.as_str()) { continue; }
            let size = entry.metadata()?.len();
            let previewable = PREVIEWABLE_EXTENSIONS.contains(&ext.as_str());
            files.push(FileInfo {
                name: path.file_name().unwrap().to_string_lossy().into_owned(),
                path: path.to_string_lossy().into_owned(),
                size,
                previewable,
            });
        }
        files.sort_by(|a, b| a.name.cmp(&b.name));
        Ok::<Vec<FileInfo>, std::io::Error>(files)
    })
    .await;

    match result {
        Ok(Ok(files)) => (StatusCode::OK, Json(files)).into_response(),
        Ok(Err(e)) => err500(e.into()).into_response(),
        Err(e) => err500(anyhow::anyhow!(e)).into_response(),
    }
}

async fn serve_image(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let path_str = match params.get("path") {
        Some(p) => p.clone(),
        None => return err400("missing path param").into_response(),
    };
    let path = PathBuf::from(&path_str);
    let source = PathBuf::from(&state.config.source);
    if let Err(e) = validate_under_source(&path, &source) {
        return e.into_response();
    }

    match tokio::fs::read(&path).await {
        Ok(bytes) => {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            let content_type = match ext.as_str() {
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "tiff" => "image/tiff",
                _ => "application/octet-stream",
            };
            (StatusCode::OK, [(header::CONTENT_TYPE, content_type)], bytes).into_response()
        }
        Err(e) => err500(e.into()).into_response(),
    }
}

async fn upload_files(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let dir_str = match params.get("dir") {
        Some(d) => d.clone(),
        None => return err400("missing dir param").into_response(),
    };
    eprintln!("[upload] dir={dir_str}");
    let dir = PathBuf::from(&dir_str);
    let source = PathBuf::from(&state.config.source);
    if let Err(e) = validate_under_source(&dir, &source) {
        return e.into_response();
    }

    let mut saved: Vec<String> = Vec::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        let filename = match field.file_name() {
            Some(n) => n.to_string(),
            None => continue,
        };
        let safe_name = Path::new(&filename)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        let ext = Path::new(&safe_name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }
        let heic = matches!(ext.as_str(), "heic" | "heif");
        match field.bytes().await {
            Ok(data) => {
                if heic {
                    let stem = Path::new(&safe_name)
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned();
                    let tmp = dir.join(&safe_name);
                    let jpeg_name = format!("{stem}.jpg");
                    let dest = dir.join(&jpeg_name);
                    if let Err(e) = tokio::fs::write(&tmp, &data).await {
                        return err500(e.into()).into_response();
                    }
                    #[cfg(target_os = "macos")]
                    let mut cmd = {
                        let mut c = tokio::process::Command::new("sips");
                        c.args(["-s", "format", "jpeg"]).arg(&tmp).args(["--out"]).arg(&dest);
                        c
                    };
                    #[cfg(not(target_os = "macos"))]
                    let mut cmd = {
                        let mut c = tokio::process::Command::new("convert");
                        c.arg(&tmp).arg(&dest);
                        c
                    };
                    let status = cmd.status().await;
                    let _ = tokio::fs::remove_file(&tmp).await;
                    match status {
                        Ok(s) if s.success() => saved.push(jpeg_name),
                        Ok(s) => return err500(anyhow::anyhow!("heic conversion exited with {s}")).into_response(),
                        Err(e) => return err500(e.into()).into_response(),
                    }
                } else {
                    let dest = dir.join(&safe_name);
                    if let Err(e) = tokio::fs::write(&dest, &data).await {
                        return err500(e.into()).into_response();
                    }
                    saved.push(safe_name);
                }
            }
            Err(e) => {
                eprintln!("[upload] bytes() error: {e}");
                return err500(anyhow::anyhow!(e)).into_response();
            }
        }
    }

    (StatusCode::OK, Json(json!({ "saved": saved }))).into_response()
}

async fn create_directory(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let name = match body.get("name").and_then(|v| v.as_str()) {
        Some(n) => n.trim().to_string(),
        None => return err400("missing name").into_response(),
    };
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.starts_with('.') {
        return err400("invalid directory name").into_response();
    }
    let path = PathBuf::from(&state.config.source).join(&name);
    if path.exists() {
        return err400("directory already exists").into_response();
    }
    match std::fs::create_dir(&path) {
        Ok(()) => (StatusCode::CREATED, Json(json!({ "path": path.to_string_lossy() }))).into_response(),
        Err(e) => err500(e.into()).into_response(),
    }
}

async fn delete_directory(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let path_str = match params.get("path") {
        Some(p) => p.clone(),
        None => return err400("missing path param").into_response(),
    };
    let path = PathBuf::from(&path_str);
    let source = PathBuf::from(&state.config.source);
    if let Err(e) = validate_under_source(&path, &source) {
        return e.into_response();
    }
    let relative = match path.strip_prefix(&source) {
        Ok(r) => r,
        Err(_) => return err400("path must be under source directory").into_response(),
    };
    if relative.components().count() != 1 {
        return err400("can only delete top-level directories").into_response();
    }
    if !path.is_dir() {
        return err400("path is not a directory").into_response();
    }
    match std::fs::remove_dir_all(&path) {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => err500(e.into()).into_response(),
    }
}

async fn delete_file(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let path_str = match params.get("path") {
        Some(p) => p.clone(),
        None => return err400("missing path param").into_response(),
    };
    let path = PathBuf::from(&path_str);
    let source = PathBuf::from(&state.config.source);
    if let Err(e) = validate_under_source(&path, &source) {
        return e.into_response();
    }
    if !path.is_file() {
        return err400("path is not a file").into_response();
    }
    match tokio::fs::remove_file(&path).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => err500(e.into()).into_response(),
    }
}

async fn serve_asset(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match Assets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref().to_owned())], content.data).into_response()
        }
        None => match Assets::get("index.html") {
            Some(index) => ([(header::CONTENT_TYPE, "text/html")], index.data).into_response(),
            None => (StatusCode::NOT_FOUND, "not found").into_response(),
        },
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let config: OrcConfig = {
        let path = curator_config_path()?;
        let raw = std::fs::read_to_string(&path)
            .with_context(|| format!("curator.toml not found at {}, run `curator setup`", path.display()))?;
        toml::from_str(&raw).context("failed to parse curator.toml")?
    };

    let app_state = AppState {
        config: Arc::new(config),
        sync_status: Arc::new(Mutex::new(SyncStatus { running: false, last_error: None })),
    };

    let router = Router::new()
        .route("/api/tree", get(get_tree))
        .route("/api/state", get(get_state).post(post_state))
        .route("/api/sync", post(post_sync))
        .route("/api/sync/status", get(get_sync_status))
        .route("/api/files", get(list_files))
        .route("/api/image", get(serve_image))
        .route("/api/upload", post(upload_files).layer(DefaultBodyLimit::max(200 * 1024 * 1024)))
        .route("/api/file", delete(delete_file))
        .route("/api/directory", post(create_directory).delete(delete_directory))
        .fallback(serve_asset)
        .with_state(app_state);

    let port: u16 = std::env::var("FRAME_CONTROLLER_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
