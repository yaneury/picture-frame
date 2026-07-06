fn main() {
    println!("cargo:rerun-if-changed=ui/src");
    println!("cargo:rerun-if-changed=ui/index.html");
    println!("cargo:rerun-if-changed=ui/package.json");
    println!("cargo:rerun-if-changed=ui/vite.config.ts");

    let ui = std::path::Path::new("ui");

    if !ui.join("node_modules").exists() {
        let status = std::process::Command::new("npm")
            .arg("install")
            .current_dir(ui)
            .status()
            .expect("npm install failed");
        assert!(status.success(), "npm install exited non-zero");
    }

    let status = std::process::Command::new("npm")
        .args(["run", "build"])
        .current_dir(ui)
        .status()
        .expect("npm run build failed");
    assert!(status.success(), "npm run build exited non-zero");
}
