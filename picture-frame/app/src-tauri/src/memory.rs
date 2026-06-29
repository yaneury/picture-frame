use {
    log::info,
    serde::{Deserialize, Serialize},
    std::{collections::HashMap, convert::From, fs, path::PathBuf, time::SystemTime},
};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Picture,
    Video,
    Unknown,
}

impl From<&str> for Category {
    fn from(extension: &str) -> Category {
        let category_extensions_map: HashMap<&str, Category> = [
            ("png", Category::Picture),
            ("jpg", Category::Picture),
            ("jpeg", Category::Picture),
            ("heic", Category::Picture),
            ("gif", Category::Picture),
            ("mp4", Category::Video),
            ("mov", Category::Video),
        ]
        .into_iter()
        .collect();

        category_extensions_map
            .get(extension)
            .unwrap_or(&Category::Unknown)
            .clone()
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Memory {
    filename: String,
    category: Category,
    created: SystemTime,
}

pub fn fetch_all_memories_in_directory(directory: PathBuf) -> Result<Vec<Memory>, String> {
    info!("Fetching all memories for directory {:?}", directory);
    let files = fs::read_dir(directory).map_err(|e| format!("Failed to open directory: {}", e))?;

    files
        .into_iter()
        .filter_map(|path_or| match path_or {
            Ok(entry) => {
                let path = entry.path();
                let filename = path
                    .file_name()
                    .and_then(|f| f.to_str())
                    .unwrap_or_default()
                    .to_owned();

                if let None = path.extension() {
                    return None;
                }

                let extension = path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext.to_lowercase());
                let category = extension
                    .as_ref()
                    .map(|ext| Category::from(ext.as_str()))
                    .unwrap();

                if category == Category::Unknown {
                    return None;
                }

                let metadata = entry
                    .metadata()
                    .map_err(|e| format!("Failed to fetch metadata: {}", e));
                let created = metadata.clone().and_then(|m| {
                    m.created()
                        .map_err(|e| format!("Failed to fetch created: {}", e))
                });

                match (metadata, created) {
                    (Ok(_metadata), Ok(created)) => Some(Ok(Memory {
                        filename,
                        category,
                        created,
                    })),
                    (Err(err), _) | (_, Err(err)) => Some(Err(format!("{}", err))),
                }
            }
            Err(err) => Some(Err(format!("Failed to unwrap directory entry {}", err))),
        })
        .collect()
}
