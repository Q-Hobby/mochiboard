// Mochiboard: a Mac app around the canvas in web/. Swift handles what a web page can't:
// saving boards as files, fetching link previews, and asking Mochi (Claude Code, run locally with `claude -p`).
import AppKit
@preconcurrency import WebKit

let support = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Mochiboard")
let boardsDir = support.appendingPathComponent("boards")

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!

    func applicationDidFinishLaunching(_ n: Notification) {
        try? FileManager.default.createDirectory(at: boardsDir, withIntermediateDirectories: true)
        buildMenu()
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "mb")
        // tell the page it's in the app (it makes room for the window buttons)
        config.userContentController.addUserScript(WKUserScript(source: "document.documentElement.classList.add('native')", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true; window.titleVisibility = .hidden; window.title = "Mochiboard"
        window.backgroundColor = NSColor(red: 0.984, green: 0.973, blue: 0.988, alpha: 1)
        window.minSize = NSSize(width: 900, height: 560)
        let host = NSView(); window.contentView = host
        web.frame = host.bounds; web.autoresizingMask = [.width, .height]; host.addSubview(web)
        // a strip at the top of the sidebar to drag the window by (the page fills the whole window, title bar included)
        let strip = DragStrip(frame: NSRect(x: 76, y: host.bounds.height - 40, width: 156, height: 40)); strip.autoresizingMask = [.minYMargin]; host.addSubview(strip)
        window.center(); window.setFrameAutosaveName("Mochiboard")
        let page = Bundle.main.resourceURL!.appendingPathComponent("web/index.html")
        web.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }

    // links on the board open in the browser, not inside the app
    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = a.request.url, a.navigationType == .linkActivated, u.scheme?.hasPrefix("http") == true { NSWorkspace.shared.open(u); decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }

    // MARK: messages from the page: {id, op, args}; answered with __mbReply(id, ok, value)
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let body = m.body as? [String: Any], let id = body["id"] as? Int, let op = body["op"] as? String else { return }
        let args = body["args"] as? [String: Any] ?? [:]
        let reply: (Bool, Any) -> Void = { [weak self] ok, value in
            let json = (try? JSONSerialization.data(withJSONObject: [value], options: [.fragmentsAllowed])).flatMap { String(data: $0, encoding: .utf8) } ?? "[null]"
            DispatchQueue.main.async { self?.web.evaluateJavaScript("__mbReply(\(id), \(ok), \(json)[0])") }
        }
        switch op {
        case "list":
            let files = (try? FileManager.default.contentsOfDirectory(at: boardsDir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
            let list: [[String: Any]] = files.filter { $0.pathExtension == "json" }.compactMap { f in
                guard let d = try? Data(contentsOf: f), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return nil }
                let mod = (try? f.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                return ["id": j["id"] ?? "", "name": j["name"] ?? "Untitled", "color": j["color"] ?? "pink", "updated": mod.timeIntervalSince1970]
            }.sorted { ($0["updated"] as! Double) > ($1["updated"] as! Double) }
            reply(true, list)
        case "load":
            let f = boardsDir.appendingPathComponent("\(safe(args["id"])).json")
            if let d = try? Data(contentsOf: f), let j = try? JSONSerialization.jsonObject(with: d) { reply(true, j) } else { reply(true, NSNull()) }
        case "save":
            guard let b = args["board"] as? [String: Any], let d = try? JSONSerialization.data(withJSONObject: b) else { return reply(false, "bad board") }
            let f = boardsDir.appendingPathComponent("\(safe(b["id"])).json"), tmp = f.appendingPathExtension("tmp")
            do { try d.write(to: tmp); _ = try? FileManager.default.removeItem(at: f); try FileManager.default.moveItem(at: tmp, to: f); reply(true, true) } catch { reply(false, error.localizedDescription) }
        case "remove":
            try? FileManager.default.removeItem(at: boardsDir.appendingPathComponent("\(safe(args["id"])).json")); reply(true, true)
        case "linkPreview":
            linkPreview(args["url"] as? String ?? "") { reply(true, $0) }
        case "ask":
            askMochi(args["prompt"] as? String ?? "", args["board"] ?? [:]) { ok, text in reply(ok, text) }
        default: reply(false, "unknown op \(op)")
        }
    }
    func safe(_ v: Any?) -> String { String(describing: v ?? "x").filter { $0.isLetter || $0.isNumber || $0 == "-" } }

    // MARK: link previews: the page's title, description and image (og: tags)
    func linkPreview(_ s: String, done: @escaping ([String: String]) -> Void) {
        guard let url = URL(string: s) else { return done(["title": s, "desc": s, "image": ""]) }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Mochiboard", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: req) { data, _, _ in
            let html = String(data: (data ?? Data()).prefix(400_000), encoding: .utf8) ?? String(decoding: (data ?? Data()).prefix(400_000), as: UTF8.self)
            func meta(_ keys: [String]) -> String? {
                for k in keys {
                    for pat in ["<meta[^>]+(?:property|name)=[\"']\(k)[\"'][^>]+content=[\"']([^\"']*)[\"']", "<meta[^>]+content=[\"']([^\"']*)[\"'][^>]+(?:property|name)=[\"']\(k)[\"']"] {
                        if let r = html.range(of: pat, options: [.regularExpression, .caseInsensitive]) {
                            let tag = String(html[r]); if let c = tag.range(of: "content=[\"']([^\"']*)", options: .regularExpression) { return String(tag[c].dropFirst(9)) }
                        }
                    }
                }
                return nil
            }
            var title = meta(["og:title", "twitter:title"]) ?? ""
            if title.isEmpty, let r = html.range(of: "<title[^>]*>([^<]*)</title>", options: [.regularExpression, .caseInsensitive]) { title = String(html[r]).replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression) }
            var image = meta(["og:image", "twitter:image"]) ?? ""
            if !image.isEmpty, let abs = URL(string: image, relativeTo: url) { image = abs.absoluteString }
            let decode = { (s: String) in s.replacingOccurrences(of: "&amp;", with: "&").replacingOccurrences(of: "&#39;", with: "'").replacingOccurrences(of: "&quot;", with: "\"").trimmingCharacters(in: .whitespacesAndNewlines) }
            done(["title": decode(title.isEmpty ? (url.host ?? s) : title), "desc": decode(meta(["og:description", "description"]) ?? (url.host ?? s)), "image": image])
        }.resume()
    }

    // MARK: Mochi: asks Claude Code on this Mac (`claude -p`), which answers with JSON actions for the canvas
    lazy var claudePath: String? = {
        let p = Process(), out = Pipe(); p.executableURL = URL(fileURLWithPath: "/bin/zsh"); p.arguments = ["-lc", "command -v claude"]; p.standardOutput = out; p.standardError = Pipe()
        try? p.run(); p.waitUntilExit()
        let s = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !s.isEmpty { return s }
        return ["~/.claude/local/claude", "~/.local/bin/claude", "/opt/homebrew/bin/claude", "/usr/local/bin/claude"].map { NSString(string: $0).expandingTildeInPath }.first { FileManager.default.isExecutableFile(atPath: $0) }
    }()
    func askMochi(_ request: String, _ board: Any, done: @escaping (Bool, String) -> Void) {
        guard let claude = claudePath else { return done(false, "I need Claude Code to think. Install it from claude.com/claude-code, then try again.") }
        let boardJSON = (try? JSONSerialization.data(withJSONObject: board)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        let prompt = """
        You are Mochi, a cute, warm little pixel goo who lives on a creative planning canvas app called Mochiboard. \
        You help designers and creative people plan: you add cards, sort ideas into groups, make moodboard plans and checklists, and spot what's missing.

        The person asked you: \(request)

        Here is their board as JSON. Positions are in pixels (x grows right, y grows down). A note card is about 220 x 140, a checklist about 240 x 180, a color swatch 120 x 150, a title is one line of big text. \
        "unsorted" holds ideas waiting in the side tray, not yet on the board. Cards marked "selected" are what they have selected right now.
        \(boardJSON)

        Reply with ONLY one JSON object, no other words before or after it. Use only the keys you need:
        {"say": "a short, friendly reply in first person (1 to 3 sentences, no em dashes)",
         "add": [{"type": "note" | "todo" | "title" | "swatch", "text": "...", "items": ["for todo"], "hex": "#rrggbb for swatch", "label": "swatch name",
                  "color": "white|pink|butter|mint|lilac|sky|peach", "x": 0, "y": 0, "tag": "optional tiny handwritten label"}],
         "titles": [{"text": "group name", "x": 0, "y": 0}],
         "move": [{"id": "existing card id", "x": 0, "y": 0, "color": "optional new color"}],
         "place": [{"id": "an unsorted card id", "x": 0, "y": 0}],
         "connect": [["card id", "card id"]]}
        When you organize, lay groups out as tidy columns about 250 px apart with a title 90 px above each group, and keep new things clear of cards you are not moving. \
        Keep note text short (under 20 words). Never invent ids: only use ids from the board.
        """
        DispatchQueue.global(qos: .userInitiated).async {
            let p = Process(), out = Pipe(), err = Pipe()
            p.executableURL = URL(fileURLWithPath: claude)
            p.arguments = ["-p", prompt, "--output-format", "text"]
            p.currentDirectoryURL = support
            var env = ProcessInfo.processInfo.environment; env["PATH"] = (env["PATH"] ?? "") + ":/opt/homebrew/bin:/usr/local/bin:" + NSString(string: "~/.local/bin").expandingTildeInPath
            p.environment = env; p.standardOutput = out; p.standardError = err; p.standardInput = FileHandle.nullDevice
            do { try p.run() } catch { return done(false, error.localizedDescription) }
            let killer = DispatchWorkItem { if p.isRunning { p.terminate() } }
            DispatchQueue.global().asyncAfter(deadline: .now() + 180, execute: killer)
            let data = out.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit(); killer.cancel()
            let text = String(data: data, encoding: .utf8) ?? ""
            if p.terminationStatus != 0 && text.isEmpty {
                let e = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "Claude Code didn't answer"
                return done(false, String(e.prefix(300)))
            }
            done(true, text)
        }
    }

    // MARK: menus (Edit is what makes copy, paste and undo work in the text)
    func buildMenu() {
        let main = NSMenu()
        let app = NSMenuItem(); main.addItem(app); let am = NSMenu(); app.submenu = am
        am.addItem(withTitle: "About Mochiboard", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        am.addItem(.separator()); am.addItem(withTitle: "Hide Mochiboard", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        am.addItem(withTitle: "Quit Mochiboard", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let edit = NSMenuItem(); main.addItem(edit); let em = NSMenu(title: "Edit"); edit.submenu = em
        em.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        em.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        em.addItem(.separator())
        em.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        em.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        em.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        em.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let win = NSMenuItem(); main.addItem(win); let wm = NSMenu(title: "Window"); win.submenu = wm
        wm.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        wm.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        NSApp.mainMenu = main; NSApp.windowsMenu = wm
    }
}

final class DragStrip: NSView {
    override func mouseDown(with e: NSEvent) { window?.performDrag(with: e) }
    override func mouseUp(with e: NSEvent) { if e.clickCount == 2 { window?.performZoom(nil) } }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
