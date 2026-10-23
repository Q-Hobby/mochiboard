// Mochiboard for Windows (and Linux): the same canvas as the Mac app (../web), with Rust doing what a web page can't:
// saving boards as files, link previews, asking Mochi (Claude Code, `claude -p`), saving videos, fonts and updates.
// The page talks to it through one command, `mb`, with the same {op, args} messages the Mac app's Swift side answers.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod prompts;
#[cfg(feature = "whisper")]
mod whisper;
#[cfg(not(feature = "whisper"))]
mod whisper { use serde_json::{json, Value}; pub fn status() -> Value { json!({ "ready": false }) } pub fn download() {} pub fn transcribe(_: &[f32]) -> Result<String, String> { Err("NEED_WHISPER".into()) } }

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Map, Value};
use std::{path::PathBuf, sync::Mutex, time::Duration};
use tauri::{http, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

// ---------- where things live: %APPDATA%\Mochiboard on Windows (MB_DATA overrides it, for testing) ----------
fn support() -> PathBuf {
    if let Ok(p) = std::env::var("MB_DATA") { return PathBuf::from(p); }
    dirs::data_dir().unwrap_or_else(std::env::temp_dir).join("Mochiboard")
}
fn boards_dir() -> PathBuf { support().join("boards") }
fn media_dir() -> PathBuf { support().join("media") }
fn safe(v: Option<&Value>) -> String {
    let s = match v { Some(Value::String(s)) => s.clone(), Some(v) => v.to_string(), None => "x".into() };
    s.chars().filter(|c| c.is_alphanumeric() || *c == '-').collect()
}
fn s<'a>(a: &'a Value, k: &str) -> &'a str { a.get(k).and_then(|v| v.as_str()).unwrap_or("") }
static USAGE_LOCK: Mutex<()> = Mutex::new(());

#[tauri::command]
async fn mb(app: tauri::AppHandle, op: String, args: Value) -> Result<Value, String> {
    let a = &args;
    match op.as_str() {
        "version" => Ok(json!(env!("CARGO_PKG_VERSION"))),
        "usage" => Ok(usage_summary()),
        "resetUsage" => { let _g = USAGE_LOCK.lock().unwrap(); let _ = std::fs::remove_file(support().join("usage.json")); Ok(json!(true)) }
        // boards: one JSON file each
        "list" => {
            let mut list: Vec<Value> = vec![];
            for e in std::fs::read_dir(boards_dir()).into_iter().flatten().flatten() {
                let p = e.path(); if p.extension().map_or(true, |x| x != "json") { continue; }
                let Ok(txt) = std::fs::read_to_string(&p) else { continue }; let Ok(j) = serde_json::from_str::<Value>(&txt) else { continue };
                let updated = e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0.0, |d| d.as_secs_f64());
                list.push(json!({ "id": j.get("id").cloned().unwrap_or(json!("")), "name": j.get("name").cloned().unwrap_or(json!("Untitled")),
                    "color": j.get("color").cloned().unwrap_or(json!("pink")), "folder": j.get("folder").cloned().unwrap_or(Value::Null),
                    "parent": j.get("parent").cloned().unwrap_or(Value::Null), "updated": updated }));
            }
            list.sort_by(|x, y| y["updated"].as_f64().partial_cmp(&x["updated"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));
            Ok(json!(list))
        }
        "load" => Ok(std::fs::read_to_string(boards_dir().join(format!("{}.json", safe(a.get("id"))))).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null)),
        "save" => {
            let b = a.get("board").ok_or("bad board")?; let f = boards_dir().join(format!("{}.json", safe(b.get("id")))); let tmp = f.with_extension("json.tmp");
            std::fs::write(&tmp, serde_json::to_vec(b).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &f).map_err(|e| e.to_string())?; Ok(json!(true))
        }
        "folders" => Ok(std::fs::read_to_string(support().join("folders.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(json!([]))),
        "saveFolders" => { std::fs::write(support().join("folders.json"), serde_json::to_vec(a.get("folders").unwrap_or(&json!([]))).unwrap()).map_err(|e| e.to_string())?; Ok(json!(true)) }
        "remove" => { let _ = std::fs::remove_file(boards_dir().join(format!("{}.json", safe(a.get("id"))))); Ok(json!(true)) }
        // the web
        "linkPreview" => Ok(link_preview(s(a, "url")).await),
        "fetchImage" => fetch_image(s(a, "url")).await.ok_or_else(|| "couldn't load that image".into()),
        // Mochi
        "connections" => Ok(connections().await),
        "ask" => ask(a).await.map(Value::String),
        "rewrite" => {
            let p = prompts::REWRITE.replace("{TITLE}", if s(a, "title").is_empty() { "Untitled" } else { s(a, "title") }).replace("{HOW}", s(a, "how"))
                .replace("{TEXT}", s(a, "text")).replace("{AROUND}", &s(a, "around").chars().take(1500).collect::<String>());
            run_claude(&p, &[], 180).await.map(|t| json!(t.trim()))
        }
        "higgsQuote" => run_claude(&prompts::HIGGS_QUOTE.replace("{MODEL}", or(s(a, "model"), "nano_banana_2")),
            &["mcp__claude_ai_higgsfield__balance", "mcp__claude_ai_higgsfield__models_explore", "mcp__claude_ai_higgsfield__show_plans_and_credits"], 180).await.map(Value::String),
        "higgsMake" => run_claude(&prompts::HIGGS_MAKE.replace("{MODEL}", or(s(a, "model"), "nano_banana_2")).replace("{STYLE}", or(s(a, "style"), "clean, modern, natural light"))
            .replace("{JOBS}", &a.get("images").unwrap_or(&json!([])).to_string()),
            &["mcp__claude_ai_higgsfield__generate_image_batch", "mcp__claude_ai_higgsfield__generate_image", "mcp__claude_ai_higgsfield__jobs_wait", "mcp__claude_ai_higgsfield__models_explore", "mcp__claude_ai_higgsfield__show_generation_by_ids"], 1200).await.map(Value::String),
        "drawFill" => run_claude(&prompts::DRAW_FILL.replace("{STYLE}", or(s(a, "style"), "soft pastel, rounded shapes, minimal")).replace("{JOBS}", &a.get("images").unwrap_or(&json!([])).to_string()), &[], 600).await.map(Value::String),
        // this computer
        "fonts" => Ok(json!(fonts())),
        "speechAuth" => Ok(json!("ok")),
        // voice memos → words with Whisper, on this computer (the page hands over 16 kHz mono audio)
        "whisperStatus" => Ok(whisper::status()),
        "whisperGet" => { whisper::download(); Ok(json!(true)) }
        "transcribe" => {
            let pcm = B64.decode(s(a, "pcm")).map_err(|_| "couldn't read that recording")?;
            let samples: Vec<f32> = pcm.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
            tokio::task::spawn_blocking(move || whisper::transcribe(&samples)).await.map_err(|e| e.to_string())?.map(Value::String)
        }
        "export" => Err("Saving a picture of the board is coming to Windows soon ✦".into()),
        "saveFile" => {
            let name = s(a, "name").replace(['/', '\\'], "-"); let ext = or(s(a, "ext"), "docx").to_string();
            let data = B64.decode(s(a, "data")).map_err(|_| "Nothing to save")?;
            let picked = app.dialog().file().set_file_name(format!("{}.{}", or(&name, "Document"), ext)).add_filter(ext.to_uppercase(), &[ext.as_str()]).blocking_save_file();
            match picked.and_then(|p| p.into_path().ok()) {
                Some(p) => { std::fs::write(&p, data).map_err(|e| e.to_string())?; Ok(json!(p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())) }
                None => Ok(json!("")),
            }
        }
        "reveal" => { let _ = app.opener().open_path(boards_dir().to_string_lossy(), None::<&str>); Ok(json!(true)) }
        "openURL" => { let u = s(a, "url"); if u.starts_with("http") || u.starts_with("mailto:") || u.starts_with("spotify:") { let _ = app.opener().open_url(u, None::<&str>); } Ok(json!(true)) }
        // videos: saved as their own files in pieces (big files cross the bridge in chunks), shown through the mbmedia: address
        "mediaBegin" => {
            let ext: String = s(a, "ext").chars().filter(|c| c.is_alphanumeric()).take(5).collect();
            let name = format!("{}.{}", uuid::Uuid::new_v4(), if ext.is_empty() { "mp4".into() } else { ext });
            std::fs::write(media_dir().join(&name), b"").map_err(|e| e.to_string())?; Ok(json!(name))
        }
        "mediaChunk" => {
            use std::io::Write;
            let name = s(a, "name").replace(['/', '\\'], ""); let d = B64.decode(s(a, "data")).map_err(|_| "I couldn't save that video.")?;
            let mut f = std::fs::OpenOptions::new().append(true).open(media_dir().join(name)).map_err(|_| "I couldn't save that video.")?;
            f.write_all(&d).map_err(|e| e.to_string())?; Ok(json!(true))
        }
        "mediaEnd" => Ok(json!(format!("mbmedia://media/{}", s(a, "name").replace(['/', '\\'], "")))),
        // updates: GitHub Releases has a Windows installer next to the Mac zip
        "updateCheck" => Ok(update_check().await),
        "updatePrepare" => Err("Automatic updates are coming to Windows soon.".into()),
        "updateNow" => update_now(&app).await.map(Value::String),
        // a self-test hook for building: only there when MB_SELFTEST is set
        "log" if std::env::var("MB_SELFTEST").is_ok() => { println!("SELFTEST {}", s(a, "msg")); Ok(json!(true)) }
        "quit" if std::env::var("MB_SELFTEST").is_ok() => { app.exit(0); Ok(json!(true)) }
        _ => Err(format!("unknown op {op}")),
    }
}
fn or<'a>(v: &'a str, d: &'a str) -> &'a str { if v.is_empty() { d } else { v } }

// ---------- link previews: the page's title, description and picture ----------
fn client() -> reqwest::Client { reqwest::Client::builder().user_agent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Mochiboard").timeout(Duration::from_secs(15)).build().unwrap() }
async fn link_preview(u: &str) -> Value {
    let host = reqwest::Url::parse(u).ok().and_then(|x| x.host_str().map(String::from)).unwrap_or_else(|| u.to_string());
    let html = match client().get(u).send().await { Ok(r) => r.text().await.unwrap_or_default(), Err(_) => String::new() };
    let html: String = html.chars().take(400_000).collect();
    let meta = |keys: &[&str]| -> Option<String> {
        for k in keys {
            for pat in [format!(r#"(?i)<meta[^>]+(?:property|name)=["']{k}["'][^>]+content=["']([^"']*)["']"#), format!(r#"(?i)<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']{k}["']"#)] {
                if let Some(c) = regex::Regex::new(&pat).ok()?.captures(&html) { return Some(c[1].to_string()); }
            }
        }
        None
    };
    let mut title = meta(&["og:title", "twitter:title"]).unwrap_or_default();
    if title.is_empty() { if let Some(c) = regex::Regex::new(r"(?is)<title[^>]*>([^<]*)</title>").unwrap().captures(&html) { title = c[1].to_string(); } }
    let mut image = meta(&["og:image", "twitter:image"]).unwrap_or_default();
    if !image.is_empty() { if let Ok(base) = reqwest::Url::parse(u) { if let Ok(abs) = base.join(&image) { image = abs.to_string(); } } }
    let decode = |s: String| s.replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", "\"").trim().to_string();
    json!({ "title": decode(if title.is_empty() { host.clone() } else { title }), "desc": decode(meta(&["og:description", "description"]).unwrap_or(host)), "image": image })
}
// pictures from Mobbin or Higgsfield come in as links; bring them home as data so they're saved with the board
async fn fetch_image(u: &str) -> Option<Value> {
    let r = client().get(u).timeout(Duration::from_secs(30)).send().await.ok()?;
    let t = r.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("image/jpeg").split(';').next().unwrap_or("image/jpeg").to_string();
    let b = r.bytes().await.ok()?; if b.len() < 200 { return None; }
    Some(json!(format!("data:{t};base64,{}", B64.encode(&b))))
}

// ---------- Mochi: Claude Code on this computer ----------
fn find_claude() -> Option<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    let mut spots: Vec<PathBuf> = vec![];
    if cfg!(windows) {
        spots.push(home.join(".local").join("bin").join("claude.exe"));   // the official installer
        if let Some(d) = dirs::data_dir() { spots.push(d.join("npm").join("claude.cmd")); spots.push(d.join("npm").join("claude.exe")); }   // npm install -g
        if let Some(d) = dirs::data_local_dir() { spots.push(d.join("Programs").join("claude").join("claude.exe")); }
    } else {
        for p in [".local/bin/claude", ".claude/local/claude", ".npm-global/bin/claude", ".volta/bin/claude", ".bun/bin/claude"] { spots.push(home.join(p)); }
        spots.push("/opt/homebrew/bin/claude".into()); spots.push("/usr/local/bin/claude".into());
    }
    if let Some(hit) = spots.into_iter().find(|p| p.is_file()) { return Some(hit); }
    // anywhere else on the PATH
    let finder = if cfg!(windows) { ("where", vec!["claude"]) } else { ("/bin/zsh", vec!["-lc", "command -v claude"]) };
    let mut c = std::process::Command::new(finder.0); c.args(&finder.1);
    #[cfg(windows)] { use std::os::windows::process::CommandExt; c.creation_flags(0x0800_0000); }
    let out = c.output().ok()?; String::from_utf8_lossy(&out.stdout).lines().map(|l| PathBuf::from(l.trim())).find(|p| p.is_file())
}
fn claude_cmd(claude: &PathBuf) -> tokio::process::Command {
    let mut c = tokio::process::Command::new(claude);
    c.current_dir(support()).kill_on_drop(true);
    #[cfg(windows)] { c.creation_flags(0x0800_0000); }   // no black console window flashing up
    #[cfg(not(windows))] { let path = std::env::var("PATH").unwrap_or_default(); c.env("PATH", format!("{path}:/opt/homebrew/bin:/usr/local/bin:{}/.local/bin", dirs::home_dir().unwrap_or_default().display())); }
    c
}
async fn connections() -> Value {
    let Some(claude) = find_claude() else { return json!({ "claude": false, "mobbin": false, "higgsfield": false }) };
    let out = claude_cmd(&claude).args(["mcp", "list"]).stdin(std::process::Stdio::null()).output().await;
    let text = out.map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase()).unwrap_or_default();
    let ok = |n: &str| text.lines().any(|l| l.contains(n) && l.contains("connected") && !l.contains("needs"));
    json!({ "claude": true, "mobbin": ok("mobbin"), "higgsfield": ok("higgsfield") })
}
// the prompt goes in through stdin: a board can be far longer than Windows allows on a command line
async fn run_claude(prompt: &str, tools: &[&str], timeout: u64) -> Result<String, String> {
    use tokio::io::AsyncWriteExt;
    let claude = find_claude().ok_or("I need Claude Code to think. Set it up from mochiboard.app/connect.html, then try again.")?;
    let mut c = claude_cmd(&claude); c.args(["-p", "--output-format", "json"]);
    if !tools.is_empty() { c.args(["--allowedTools", &tools.join(",")]); }
    let mut child = c.stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    let mut stdin = child.stdin.take().unwrap(); let p = prompt.to_string();
    tokio::spawn(async move { let _ = stdin.write_all(p.as_bytes()).await; let _ = stdin.shutdown().await; });
    let out = tokio::time::timeout(Duration::from_secs(timeout), child.wait_with_output()).await.map_err(|_| "Claude took too long to answer.")?.map_err(|e| e.to_string())?;
    let j: Option<Value> = serde_json::from_slice(&out.stdout).ok();
    let text = claude_result(j.as_ref(), &out.stdout);
    // a failed answer (not signed in, no plan…) comes back as an error, not as words for Mochi to read
    if j.as_ref().and_then(|j| j.get("is_error")).and_then(|v| v.as_bool()) == Some(true) { return Err(text.chars().take(300).collect()); }
    if !out.status.success() && text.is_empty() { return Err(String::from_utf8_lossy(&out.stderr).chars().take(300).collect::<String>().trim().to_string().pipe_or("Claude Code didn't answer")); }
    Ok(text)
}
trait PipeOr { fn pipe_or(self, d: &str) -> String; }
impl PipeOr for String { fn pipe_or(self, d: &str) -> String { if self.is_empty() { d.into() } else { self } } }
async fn ask(a: &Value) -> Result<String, String> {
    let mobbin = a.get("mobbin").and_then(|v| v.as_bool()).unwrap_or(true);
    let higgs = a.get("higgs").and_then(|v| v.as_bool()).unwrap_or(true);
    let confirmed = a.get("confirmed").and_then(|v| v.as_bool()).unwrap_or(false);
    let prompt = prompts::ASK.replace("{REQUEST}", s(a, "prompt")).replace("{BOARD}", &a.get("board").unwrap_or(&json!({})).to_string())
        .replace("{MOBBIN_OFF}", if mobbin { "" } else { prompts::MOBBIN_OFF }).replace("{HIGGS_OFF}", if higgs { "" } else { prompts::HIGGS_OFF })
        .replace("{HIGGS_RULE}", if confirmed { prompts::HIGGS_YES } else { prompts::HIGGS_NO });
    // only the helpers the person has switched on; the image generator only after they tap yes
    let mut tools: Vec<&str> = if mobbin { vec!["mcp__claude_ai_Mobbin__search_screens", "mcp__claude_ai_Mobbin__search_flows", "mcp__claude_ai_Mobbin__search_sections"] } else { vec![] };
    if confirmed && higgs { tools.extend(["mcp__claude_ai_higgsfield__generate_image_batch", "mcp__claude_ai_higgsfield__jobs_wait", "mcp__claude_ai_higgsfield__models_explore"]); }
    run_claude(&prompt, &tools, 300).await
}
// Claude Code's JSON answer: note what it used (usage.json, same as the Mac app), hand back just the words
fn claude_result(j: Option<&Value>, raw: &[u8]) -> String {
    let Some(j) = j else { return String::from_utf8_lossy(raw).to_string() };
    let Some(result) = j.get("result").and_then(|v| v.as_str()) else { return String::from_utf8_lossy(raw).to_string() };
    let u = j.get("usage").cloned().unwrap_or(json!({})); let n = |k: &str| u.get(k).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let entry = json!([chrono::Utc::now().timestamp() as f64, n("input_tokens") + n("cache_creation_input_tokens") + n("cache_read_input_tokens"), n("output_tokens"), j.get("total_cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0)]);
    let _g = USAGE_LOCK.lock().unwrap(); let f = support().join("usage.json");
    let mut all: Vec<Value> = std::fs::read_to_string(&f).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
    all.push(entry); if all.len() > 5000 { let k = all.len() - 5000; all.drain(0..k); }
    let _ = std::fs::write(&f, serde_json::to_vec(&all).unwrap());
    result.to_string()
}
fn usage_summary() -> Value {
    let all: Vec<Value> = { let _g = USAGE_LOCK.lock().unwrap(); std::fs::read_to_string(support().join("usage.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default() };
    let now = chrono::Local::now(); let day = now.date_naive().and_hms_opt(0, 0, 0).unwrap().and_local_timezone(chrono::Local).single().map_or(0, |d| d.timestamp()) as f64;
    let week = now.timestamp() as f64 - 7.0 * 86400.0;
    let sum = |since: f64| { let xs: Vec<&Value> = all.iter().filter(|e| e[0].as_f64().unwrap_or(0.0) >= since).collect();
        let f = |i: usize| xs.iter().map(|e| e[i].as_f64().unwrap_or(0.0)).sum::<f64>(); json!({ "asks": xs.len(), "tokensIn": f(1), "tokensOut": f(2), "cost": f(3) }) };
    json!({ "today": sum(day), "week": sum(week), "all": sum(0.0), "since": all.first().and_then(|e| e[0].as_f64()).unwrap_or(0.0) })
}

// ---------- fonts on this computer, for the font menus ----------
fn fonts() -> Vec<String> {
    let mut db = fontdb::Database::new(); db.load_system_fonts();
    let mut names: Vec<String> = db.faces().flat_map(|f| f.families.iter().map(|(n, _)| n.clone())).filter(|n| !n.starts_with('.') && !n.starts_with('@')).collect();
    names.sort_by_key(|n| n.to_lowercase()); names.dedup(); names
}

// ---------- updates ----------
fn newer(a: &str, b: &str) -> bool {
    let p = |s: &str| s.trim_start_matches('v').split('.').map(|x| x.parse::<u64>().unwrap_or(0)).collect::<Vec<_>>();
    let (x, y) = (p(a), p(b)); for i in 0..x.len().max(y.len()) { let (m, n) = (x.get(i).copied().unwrap_or(0), y.get(i).copied().unwrap_or(0)); if m != n { return m > n; } } false
}
const INSTALLER: &str = "Mochiboard-Setup.exe";
// test builds (made on the windows branch) look at a private feed instead of the public releases, with a build number to compare
const FEED: Option<&str> = option_env!("MB_UPDATE_FEED");
const BUILD: Option<&str> = option_env!("MB_BUILD");
async fn latest_release() -> Option<Value> {
    let api = std::env::var("MB_RELEASE_API").ok().or(FEED.map(String::from)).unwrap_or_else(|| "https://api.github.com/repos/jessawolfe-ux/mochiboard/releases/latest".into());
    client().get(api).header("Accept", "application/vnd.github+json").send().await.ok()?.json().await.ok()
}
fn installer_url(r: &Value) -> Option<String> {
    r.get("assets")?.as_array()?.iter().find(|x| x["name"].as_str() == Some(INSTALLER))?.get("browser_download_url")?.as_str().map(String::from)
}
async fn update_check() -> Value {
    let me = env!("CARGO_PKG_VERSION");
    let Some(r) = latest_release().await else { return json!({ "release": true, "offline": true, "since": me }) };
    let tag = r["tag_name"].as_str().unwrap_or("").to_string();
    let notes: Vec<String> = r["body"].as_str().unwrap_or("").lines().map(str::trim).filter(|l| l.starts_with("- ")).map(|l| l[2..].to_string()).collect();
    // only offer it once that release has a Windows installer
    let mine: u64 = BUILD.and_then(|b| b.parse().ok()).unwrap_or(0);
    let fresh = match (FEED, r.get("build").and_then(|b| b.as_u64())) { (Some(_), Some(b)) => b > mine, _ => newer(&tag, me) };
    let behind = if fresh && installer_url(&r).is_some() { 1 } else { 0 };
    json!({ "release": true, "behind": behind, "notes": notes, "since": me, "latest": if FEED.is_some() { format!("{tag} (test {})", r.get("build").and_then(|b| b.as_u64()).unwrap_or(0)) } else { tag } })
}
// download the new installer, start it, and step aside so it can replace this copy
async fn update_now(app: &tauri::AppHandle) -> Result<String, String> {
    let r = latest_release().await.ok_or("I couldn't reach GitHub just now.")?;
    let url = installer_url(&r).ok_or("The Windows version of this update isn't ready yet. Try again in a bit.")?;
    let bytes = client().get(url).timeout(Duration::from_secs(600)).send().await.map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
    let f = std::env::temp_dir().join(format!("mochiboard-update-{}.exe", uuid::Uuid::new_v4()));
    std::fs::write(&f, &bytes).map_err(|e| e.to_string())?;
    std::process::Command::new(&f).arg("/P").spawn().map_err(|e| e.to_string())?;   // /P: the installer's quiet mode, just a progress bar
    let h = app.clone(); tokio::spawn(async move { tokio::time::sleep(Duration::from_millis(400)).await; h.exit(0); });
    Ok("updating".into())
}

// ---------- videos no board points to anymore are cleared out after a couple of days (so undo still has them for a while) ----------
fn sweep_media() {
    let used: String = std::fs::read_dir(boards_dir()).into_iter().flatten().flatten().filter_map(|e| std::fs::read_to_string(e.path()).ok()).collect();
    let old = std::time::SystemTime::now() - Duration::from_secs(2 * 86400);
    for e in std::fs::read_dir(media_dir()).into_iter().flatten().flatten() {
        let n = e.file_name().to_string_lossy().to_string();
        if !used.contains(&n) && e.metadata().and_then(|m| m.modified()).map_or(false, |t| t < old) { let _ = std::fs::remove_file(e.path()); }
    }
}
// mbmedia://media/<name> (http://mbmedia.localhost/media/<name> on Windows): streams a saved video, with byte ranges so scrubbing works
fn media_response(req: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let name = req.uri().path().rsplit('/').next().unwrap_or("").to_string();
    let bad = |code: u16| http::Response::builder().status(code).header("Access-Control-Allow-Origin", "*").body(vec![]).unwrap();
    if name.is_empty() || name.contains("..") { return bad(404); }
    let f = media_dir().join(&name); let Ok(meta) = std::fs::metadata(&f) else { return bad(404) }; let size = meta.len(); if size == 0 { return bad(404); }
    let (mut start, mut end, mut partial) = (0u64, size - 1, false);
    if let Some(r) = req.headers().get("range").and_then(|v| v.to_str().ok()).and_then(|r| r.strip_prefix("bytes=")) {
        partial = true; let mut it = r.splitn(2, '-'); let (a, b) = (it.next().unwrap_or(""), it.next().unwrap_or(""));
        if a.is_empty() { if let Ok(n) = b.parse::<u64>() { start = size.saturating_sub(n); } } else { start = a.parse().unwrap_or(0); if let Ok(e) = b.parse::<u64>() { end = e.min(size - 1); } }
        end = end.min(start + 8 * 1024 * 1024 - 1).min(size - 1);   // hand it over in pieces of up to 8 MB
    }
    if start > end { return bad(416); }
    use std::io::{Read, Seek, SeekFrom};
    let mut buf = vec![0u8; (end - start + 1) as usize];
    let ok = std::fs::File::open(&f).and_then(|mut h| { h.seek(SeekFrom::Start(start))?; h.read_exact(&mut buf) }).is_ok(); if !ok { return bad(500); }
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    let mime = match ext.as_str() { "mp4" | "m4v" => "video/mp4", "mov" => "video/quicktime", "webm" => "video/webm", "jpg" => "image/jpeg", "png" => "image/png", _ => "application/octet-stream" };
    let mut r = http::Response::builder().status(if partial { 206 } else { 200 }).header("Content-Type", mime).header("Content-Length", buf.len().to_string())
        .header("Accept-Ranges", "bytes").header("Access-Control-Allow-Origin", "*").header("Access-Control-Expose-Headers", "Content-Range, Content-Length");
    if partial { r = r.header("Content-Range", format!("bytes {start}-{end}/{size}")); }
    r.body(buf).unwrap()
}

// Windows: let the board use the camera and microphone (for videos and voice memos), like the Mac app does.
// Only those two; Windows' own privacy switches still decide whether the app may use them at all.
#[cfg(windows)]
fn allow_media(w: &tauri::WebviewWindow) {
    let _ = w.with_webview(|wv| unsafe {
        use webview2_com::{Microsoft::Web::WebView2::Win32::*, PermissionRequestedEventHandler};
        let Ok(core) = wv.controller().CoreWebView2() else { return };
        let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
            if let Some(args) = args {
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE || kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA { args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?; }
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core.add_PermissionRequested(&handler, &mut token);
    });
}

fn main() {
    let _ = std::fs::create_dir_all(boards_dir()); let _ = std::fs::create_dir_all(media_dir());
    std::thread::spawn(sweep_media);
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .register_asynchronous_uri_scheme_protocol("mbmedia", |_ctx, req, responder| { std::thread::spawn(move || responder.respond(media_response(req))); })
        .invoke_handler(tauri::generate_handler![mb])
        .setup(|app| {
            #[cfg(windows)] if let Some(w) = app.get_webview_window("main") { allow_media(&w); }
            if let Ok(js) = std::env::var("MB_SELFTEST").map(|p| std::fs::read_to_string(p).unwrap_or_default()) {
                let w = app.get_webview_window("main").unwrap();
                std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(5)); let _ = w.eval(&js); });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Mochiboard couldn't start");
}
#[allow(dead_code)]
fn _unused(_: Map<String, Value>) {}
