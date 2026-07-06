use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use dialoguer::Input;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;
use xshell::{cmd, Shell};

#[derive(Parser)]
#[command(name = "curator", about = "Curator for the twyk picture frame")]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    #[command(about = "Configure connection settings")]
    Setup,
    #[command(about = "Print the config file path")]
    Config,
    #[command(about = "Turn off the display")]
    Sleep,
    #[command(about = "Turn on the display and reboot")]
    Wake,
    #[command(about = "Sync memories to the picture frame")]
    Sync {
        #[arg(long)]
        directory: Option<String>,
    },
}

#[derive(Serialize, Deserialize)]
struct Config {
    user: String,
    host: String,
    source: String,
    staging: String,
    destination: String,
}

impl Config {
    fn path() -> Result<PathBuf> {
        let base = dirs::home_dir().context("could not find home directory")?;
        Ok(base.join(".curator.toml"))
    }

    fn load() -> Result<Self> {
        let path = Self::path()?;
        let raw = fs::read_to_string(&path).with_context(|| {
            format!(
                "config not found at {}, run ` curator setup` first",
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
    Config {
        user,
        host,
        source,
        staging,
        destination,
    }
    .save()
}

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "heic", "heif", "tiff", "gif", "webp"];

fn imagemagick_cmd() -> &'static str {
    let available = std::process::Command::new("magick")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if available {
        "magick"
    } else {
        "convert"
    }
}

fn sync(config: &Config, directory: Option<String>) -> Result<()> {
    let sh = Shell::new()?;

    let source = PathBuf::from(directory.unwrap_or_else(|| config.source.clone()));
    let staging = PathBuf::from(&config.staging);
    let staging_str = &config.staging;
    let dest = format!("{}@{}:{}", config.user, config.host, config.destination);

    if staging.exists() {
        fs::remove_dir_all(&staging).context("failed to clear staging dir")?;
    }
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
        let hash = format!("{:x}", md5::compute(fs::read(path)?));
        let name = format!("{}.{}", hash, ext);
        fs::copy(path, staging.join(name))?;
    }

    for entry in fs::read_dir(&staging).context("failed to read staging dir")? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("heic") {
            let input = path.to_string_lossy().to_string();
            let output = path.with_extension("jpeg").to_string_lossy().to_string();
            let im = imagemagick_cmd();
            cmd!(sh, "{im} {input} {output}").run()?;
            fs::remove_file(&path)?;
        }
    }

    let staging_src = format!("{}/", staging_str.trim_end_matches('/'));
    cmd!(
        sh,
        "rsync -avz --delete --exclude=*.heic --exclude=*.heif {staging_src} {dest}"
    )
    .run()?;

    let remote = config.remote();
    // pkill exits non-zero when no matching process is found; that's not an error here.
    let _ = cmd!(sh, "ssh {remote} pkill -x Xorg").run();

    Ok(())
}


fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Cmd::Setup => return setup(),
        Cmd::Config => {
            println!("{}", Config::path()?.display());
            return Ok(());
        }
        _ => {}
    }

    let config = Config::load()?;

    match cli.command {
        Cmd::Setup | Cmd::Config => unreachable!(),
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
        Cmd::Sync { directory } => sync(&config, directory)?,
    }

    Ok(())
}
