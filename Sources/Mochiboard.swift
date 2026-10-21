// Mochiboard: a Mac app around the canvas in web/. Swift handles what a web page can't:
// saving boards as files, fetching link previews, and asking Mochi (Claude Code, run locally with `claude -p`).
import AppKit
import UniformTypeIdentifiers
@preconcurrency import WebKit

let support = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Mochiboard")
let boardsDir = support.appendingPathComponent("boards")

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
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
        web.navigationDelegate = self; web.uiDelegate = self
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
                return ["id": j["id"] ?? "", "name": j["name"] ?? "Untitled", "color": j["color"] ?? "pink", "folder": j["folder"] ?? NSNull(), "updated": mod.timeIntervalSince1970]
            }.sorted { ($0["updated"] as! Double) > ($1["updated"] as! Double) }
            reply(true, list)
        case "load":
            let f = boardsDir.appendingPathComponent("\(safe(args["id"])).json")
            if let d = try? Data(contentsOf: f), let j = try? JSONSerialization.jsonObject(with: d) { reply(true, j) } else { reply(true, NSNull()) }
        case "save":
            guard let b = args["board"] as? [String: Any], let d = try? JSONSerialization.data(withJSONObject: b) else { return reply(false, "bad board") }
            let f = boardsDir.appendingPathComponent("\(safe(b["id"])).json"), tmp = f.appendingPathExtension("tmp")
            do { try d.write(to: tmp); _ = try? FileManager.default.removeItem(at: f); try FileManager.default.moveItem(at: tmp, to: f); reply(true, true) } catch { reply(false, error.localizedDescription) }
        // folders live in one small file next to the boards: [{id, name, open}]
        case "folders":
            let f = support.appendingPathComponent("folders.json")
            if let d = try? Data(contentsOf: f), let j = try? JSONSerialization.jsonObject(with: d) { reply(true, j) } else { reply(true, [Any]()) }
        case "saveFolders":
            guard let d = try? JSONSerialization.data(withJSONObject: args["folders"] ?? []) else { return reply(false, "bad folders") }
            do { try d.write(to: support.appendingPathComponent("folders.json"), options: .atomic); reply(true, true) } catch { reply(false, error.localizedDescription) }
        case "remove":
            try? FileManager.default.removeItem(at: boardsDir.appendingPathComponent("\(safe(args["id"])).json")); reply(true, true)
        case "linkPreview":
            linkPreview(args["url"] as? String ?? "") { reply(true, $0) }
        case "ask":
            askMochi(args["prompt"] as? String ?? "", args["board"] ?? [:], confirmed: args["confirmed"] as? Bool ?? false) { ok, text in reply(ok, text) }
        case "connections":
            connections { reply(true, $0) }
        case "fetchImage":
            fetchImage(args["url"] as? String ?? "") { reply($0 != nil, $0 ?? "couldn't load that image") }
        case "openURL":
            if let u = URL(string: args["url"] as? String ?? "") { NSWorkspace.shared.open(u) }; reply(true, true)
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
    // which helpers Mochi can use: Claude Code itself, and the Mobbin / Higgsfield connections in the person's Claude account
    func connections(done: @escaping ([String: Any]) -> Void) {
        guard let claude = claudePath else { return done(["claude": false, "mobbin": false, "higgsfield": false]) }
        DispatchQueue.global().async {
            let p = Process(), out = Pipe(); p.executableURL = URL(fileURLWithPath: claude); p.arguments = ["mcp", "list"]
            p.currentDirectoryURL = support; p.standardOutput = out; p.standardError = Pipe(); p.standardInput = FileHandle.nullDevice
            try? p.run(); let d = out.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
            let lines = (String(data: d, encoding: .utf8) ?? "").lowercased().split(separator: "\n")
            let ok = { (name: String) in lines.contains { $0.contains(name) && $0.contains("connected") && !$0.contains("needs") } }
            done(["claude": true, "mobbin": ok("mobbin"), "higgsfield": ok("higgsfield")])
        }
    }
    // pictures from Mobbin or Higgsfield come in as links; bring them home as data, so they're saved with the board
    func fetchImage(_ s: String, done: @escaping (String?) -> Void) {
        guard let url = URL(string: s) else { return done(nil) }
        URLSession.shared.dataTask(with: URLRequest(url: url, timeoutInterval: 30)) { data, resp, _ in
            guard let data, data.count > 200 else { return done(nil) }
            let type = (resp as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type") ?? "image/jpeg"
            done("data:\(type.split(separator: ";").first ?? "image/jpeg");base64,\(data.base64EncodedString())")
        }.resume()
    }
    func askMochi(_ request: String, _ board: Any, confirmed: Bool, done: @escaping (Bool, String) -> Void) {
        guard let claude = claudePath else { return done(false, "I need Claude Code to think. Install it from claude.com/claude-code, then try again.") }
        let boardJSON = (try? JSONSerialization.data(withJSONObject: board)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        let prompt = """
        You are Mochi, a cute, warm little pixel goo who lives on a creative planning canvas app called Mochiboard. \
        You help designers and creative people plan: you add cards, sort ideas into groups, make moodboard plans and checklists, and spot what's missing.

        The person asked you: \(request)

        Here is their board as JSON. Positions are in pixels (x grows right, y grows down). A note card is about 220 x 140, a checklist about 240 x 180, a color swatch 120 x 150, a title is one line of big text. \
        "unsorted" holds ideas waiting in the side tray, not yet on the board. Cards marked "selected" are what they have selected right now. \
        When they say "this", "these" or "it", they mean the selected cards. They can ask you to change ANY words, labels, colors or list items on any card, \
        including cards you made: use "edit" for that (only send the fields that change), and "remove" only when they ask to delete something.
        \(boardJSON)

        Reply with ONLY one JSON object, no other words before or after it. Use only the keys you need:
        {"say": "a short, friendly reply in first person (1 to 3 sentences, no em dashes)",
         "add": [{"type": "note" | "todo" | "title" | "swatch", "text": "...", "items": ["for todo"], "hex": "#rrggbb for swatch", "label": "swatch name",
                  "color": "white|pink|butter|mint|lilac|sky|peach", "x": 0, "y": 0, "tag": "optional tiny handwritten label"}],
         "titles": [{"text": "group name", "x": 0, "y": 0}],
         "move": [{"id": "existing card id", "x": 0, "y": 0, "color": "optional new color"}],
         "edit": [{"id": "existing card id", "text": "new words (a note, title, list heading, or a link's title)", "items": ["the full new list, for a todo"], "desc": "a link's note",
                   "color": "white|pink|butter|mint|lilac|sky|peach", "tag": "the little handwritten label above a card (\"\" removes it)", "hex": "#rrggbb", "label": "swatch name"}],
         "remove": ["card id"],
         "place": [{"id": "an unsorted card id", "x": 0, "y": 0}],
         "connect": [["card id", "card id"]],
         "projects": {"create": ["project name"], "rename": [{"from": "old name", "to": "new name"}]},
         "folders": {"create": [{"name": "folder name", "project": "project name or null"}], "rename": [{"from": "old folder name", "to": "new name"}],
                     "file": [{"folder": "folder name", "project": "project name, or null to take it out of its project"}],
                     "move": [{"board": "board id", "folder": "folder name, or null to take it out of its folder"}]}}
        "library" is their whole Mochiboard: projects hold folders, folders hold boards. Use "projects"/"folders" when they ask to organize, group, file or move boards, folders or projects. \
        Moving a board into a folder that doesn't exist yet creates it; filing a folder into a project that doesn't exist yet creates the project. Never invent board ids: only use ids from "library".
        When you organize, lay groups out as tidy columns about 250 px apart with a title 90 px above each group, and keep new things clear of cards you are not moving. \
        Keep note text short (under 20 words). Never invent ids: only use ids from the board.

        You may also have two design helpers (only if their tools are available to you):
        - Mobbin (real app screenshots): when they ask for UI references, inspiration or examples of screens or flows, search Mobbin and return the best 4 to 8 \
        as "images": [{"url": "the screen image url", "caption": "App name · what the screen is", "x": 0, "y": 0}].
        - Higgsfield (image generation, costs the person credits): \(confirmed
            ? "they have CONFIRMED. Generate what they asked for with Higgsfield (one image unless they asked for more; use the nano_banana_2 model), wait for it to finish, and return it in \"images\" with a short caption."
            : "they have NOT confirmed spending credits yet. Do NOT generate. If their request needs a generated image, describe in \"say\" what you would make and that it uses a few Higgsfield credits, and add \"confirm\": \"a 2 to 5 word label for the button\". Everything else in the request you can still do now.")
        If a helper isn't available, say so kindly in "say" and suggest connecting it in Mochiboard's sidebar.
        """
        DispatchQueue.global(qos: .userInitiated).async {
            let p = Process(), out = Pipe(), err = Pipe()
            p.executableURL = URL(fileURLWithPath: claude)
            var tools = ["mcp__claude_ai_Mobbin__search_screens", "mcp__claude_ai_Mobbin__search_flows", "mcp__claude_ai_Mobbin__search_sections"]
            // the generator is only switched on after the person taps "yes" in the app: spending credits needs their say-so
            if confirmed { tools += ["mcp__claude_ai_higgsfield__generate_image_batch", "mcp__claude_ai_higgsfield__jobs_wait", "mcp__claude_ai_higgsfield__models_explore"] }
            p.arguments = ["-p", prompt, "--output-format", "text", "--allowedTools", tools.joined(separator: ",")]
            p.currentDirectoryURL = support
            var env = ProcessInfo.processInfo.environment; env["PATH"] = (env["PATH"] ?? "") + ":/opt/homebrew/bin:/usr/local/bin:" + NSString(string: "~/.local/bin").expandingTildeInPath
            p.environment = env; p.standardOutput = out; p.standardError = err; p.standardInput = FileHandle.nullDevice
            do { try p.run() } catch { return done(false, error.localizedDescription) }
            let killer = DispatchWorkItem { if p.isRunning { p.terminate() } }
            DispatchQueue.global().asyncAfter(deadline: .now() + 300, execute: killer)
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

// the image button's file picker (a web page can't open one inside the app on its own)
extension AppDelegate {
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection; panel.canChooseDirectories = false
        panel.allowedContentTypes = [.image]
        panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
    }
}
