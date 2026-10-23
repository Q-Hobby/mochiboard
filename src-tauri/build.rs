fn main() {
    // MB_CHECK_ONLY: a quick `cargo check --target x86_64-pc-windows-msvc` from a Mac, which can't build Windows resources (the icon).
    // Real Windows builds (GitHub Actions) run the full tauri_build.
    if std::env::var("MB_CHECK_ONLY").is_ok() {
        for c in ["desktop", "mobile", "dev"] { println!("cargo:rustc-check-cfg=cfg({c})"); }
        println!("cargo:rustc-cfg=desktop");
        println!("cargo:rustc-env=TAURI_ENV_TARGET_TRIPLE={}", std::env::var("TARGET").unwrap_or_default()); return;
    }
    tauri_build::build()
}
