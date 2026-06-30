use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use dialoguer::Input;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;
use walkdir::WalkDir;
use xshell::{Shell, cmd};

#[derive(Parser)]
#[command(name = "orc", about = "Orchestrator for the twyk picture frame")]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    #[command(about = "Configure connection settings")]
    Setup,
    #[command(about = "Turn off the display")]
    Sleep,
    #[command(about = "Turn on the display and reboot")]
    Wake,
    #[command(about = "Sync memories to the picture frame")]
    Sync,
    #[command(about = "Build and deploy a release update")]
    Update,
    #[command(about = "Build and deploy a debug build")]
    Debug,
}

#[derive(Serialize, Deserialize)]
struct Config {
    user: String,
    host: String,
    source: String,
    staging: String,
    destination: String,
    repo: String,
}

impl Config {
    fn path() -> Result<PathBuf> {
        let base = dirs::config_dir().context("could not find config directory")?;
        Ok(base.join("twyk/digital-frame/orc.toml"))
    }

    fn load() -> Result<Self> {
        let path = Self::path()?;
        let raw = fs::read_to_string(&path).with_context(|| {
            format!(
                "config not found at {}, run `orc setup` first",
                path.display()
            )
        })?;
        toml::from_str(&raw).context("failed to parse config")
    }

    fn save(&self) -> Result<()> {
        let path = Self::path()?;
        fs::create_dir_all(path.parent().unwrap()).context("failed to create config dir")?;
        let raw = toml::to_string_pretty(self).context("failed to serialize config")?;
        fs::write(&path, raw).with_context(|| format!("failed to write {}", path.display()))?;
        println!("Config saved to {}", path.display());
        Ok(())
    }

    fn remote(&self) -> String {
        format!("{}@{}", self.user, self.host)
    }
}

fn setup() -> Result<()> {
    let user = Input::<String>::new()
        .with_prompt("SSH user")
        .interact_text()?;
    let host = Input::<String>::new()
        .with_prompt("SSH host")
        .interact_text()?;
    let source = Input::<String>::new()
        .with_prompt("Source directory (local photos path)")
        .interact_text()?;
    let staging = Input::<String>::new()
        .with_prompt("Staging directory (local temp path)")
        .interact_text()?;
    let destination = Input::<String>::new()
        .with_prompt("Destination directory (remote path)")
        .interact_text()?;
    let repo = Input::<String>::new()
        .with_prompt("Repo directory (local path to twyk repo)")
        .interact_text()?;

    Config { user, host, source, staging, destination, repo }.save()
}

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "heic", "heif", "tiff", "gif", "webp"];

fn sync(config: &Config) -> Result<()> {
    let sh = Shell::new()?;

    let source = PathBuf::from(&config.source);
    let staging = PathBuf::from(&config.staging);
    let staging_str = &config.staging;
    let dest = format!("{}@{}:{}", config.user, config.host, config.destination);

    fs::create_dir_all(&staging).context("failed to create staging dir")?;

    for entry in WalkDir::new(&source).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }
        let name = format!("{}.{}", Uuid::new_v4(), ext);
        fs::copy(path, staging.join(name))?;
    }

    for entry in fs::read_dir(&staging).context("failed to read staging dir")? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("heic") {
            let input = path.to_string_lossy().to_string();
            let output = path.with_extension("jpg").to_string_lossy().to_string();
            cmd!(sh, "heif-convert {input} {output}").run()?;
        }
    }

    cmd!(sh, "rsync -avz --exclude=*.heic {staging_str} {dest}").run()?;

    Ok(())
}

fn deploy(config: &Config, version: &str, debug: bool) -> Result<()> {
    let sh = Shell::new()?;

    let profile = if debug { "debug" } else { "release" };
    let deb = format!(
        "{}/src-tauri/target/aarch64-unknown-linux-gnu/{}/bundle/deb/twyk_{}_arm64.deb",
        config.repo, profile, version
    );
    let remote = config.remote();
    let debug_flag: &[&str] = if debug { &["--debug"] } else { &[] };

    sh.change_dir(&config.repo);
    cmd!(sh, "cargo tauri build --target aarch64-unknown-linux-gnu --bundles deb {debug_flag...}")
        .env("PKG_CONFIG_SYSROOT_DIR", "/usr/aarch64-linux-gnu/")
        .run()?;

    cmd!(sh, "scp {deb} {remote}:/home/pi/downloads/twyk.deb").run()?;
    cmd!(sh, "ssh {remote} sudo dpkg -i /home/pi/downloads/twyk.deb").run()?;
    cmd!(sh, "ssh {remote} rm /home/pi/downloads/twyk.deb").run()?;
    cmd!(sh, "ssh {remote} sudo reboot").run()?;

    Ok(())
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    if let Cmd::Setup = cli.command {
        return setup();
    }

    let config = Config::load()?;

    match cli.command {
        Cmd::Setup => unreachable!(),
        Cmd::Sleep => {
            let sh = Shell::new()?;
            let remote = config.remote();
            cmd!(sh, "ssh {remote} xset -d :0 dpms force off").run()?;
        }
        Cmd::Wake => {
            let sh = Shell::new()?;
            let remote = config.remote();
            cmd!(sh, "ssh {remote} xset -d :0 dpms force on").run()?;
            cmd!(sh, "ssh {remote} sudo reboot").run()?;
        }
        Cmd::Sync => sync(&config)?,
        Cmd::Update => deploy(&config, "0.0.6", false)?,
        Cmd::Debug => {
            let sh = Shell::new()?;
            sh.change_dir(&config.repo);
            let version = cmd!(sh, "git describe --tags --abbrev=0").read()?;
            let version = version.trim().trim_start_matches('v');
            deploy(&config, version, true)?;
        }
    }

    Ok(())
}
