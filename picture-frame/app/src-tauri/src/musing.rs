use {
    log::info,
    serde::{Deserialize, Serialize},
    std::{fs, path::PathBuf},
};

const MUSINGS_FILENAME: &str = "musings.yaml";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Quote {
    body: String,
    author: String,
    work: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Musings {
    quotes: Vec<Quote>,
}

pub fn fetch_all_musings_in_directory(directory: PathBuf) -> Result<Musings, String> {
    info!("Fetching musings from {}/{}", directory.display(), MUSINGS_FILENAME);

    match fs::read_to_string(directory.join(MUSINGS_FILENAME)) {
        Ok(content) => serde_yaml::from_str(&content).map_err(|e| format!("Failed to parse musings file: {}", e)),
        Err(err) => Err(format!("Failed to open musings file: {}", err)),
    }
}