import Cocoa
import WebKit
import PDFKit
import UniformTypeIdentifiers

let appSupport: URL = {
    let u = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("FilmFlow Workflow", isDirectory: true)
    try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
    return u
}()
let autosaveURL = appSupport.appendingPathComponent("autosave.ffworkflow")
let baseTemplateURL = appSupport.appendingPathComponent("plantilla-base.ffworkflow")
let libraryURL: URL = {
    let u = appSupport.appendingPathComponent("Proyectos", isDirectory: true)
    try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
    return u
}()
let lastProjectURL = appSupport.appendingPathComponent("ultimo-proyecto.txt")
let ioQueue = DispatchQueue(label: "com.filmflowtv.workflow.io", qos: .userInitiated)
func safeID(_ s: String) -> String { String(s.filter { $0.isLetter || $0.isNumber || $0 == "-" }.prefix(64)) }

// MARK: - iCloud Drive backup
// Mirrors the project library to iCloud Drive/FilmFlow Workflow, keeps a daily snapshot (30 days)
// and moves projects deleted in the app to an "Eliminados" folder instead of erasing them.
final class ICloudBackup {
    static let shared = ICloudBackup()
    let fm = FileManager.default
    let driveRoot = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs", isDirectory: true)
    var root: URL { driveRoot.appendingPathComponent("FilmFlow Workflow", isDirectory: true) }
    let settingsURL = appSupport.appendingPathComponent("ajustes.json")
    var pending: DispatchWorkItem?
    var lastBackup: Date?
    var lastError: String?

    var available: Bool { fm.fileExists(atPath: driveRoot.path) }
    var enabled: Bool {
        get {
            guard let d = try? Data(contentsOf: settingsURL), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return true }
            return o["icloudBackup"] as? Bool ?? true
        }
        set {
            let d = try? JSONSerialization.data(withJSONObject: ["icloudBackup": newValue])
            try? d?.write(to: settingsURL)
        }
    }

    func status() -> [String: Any] {
        var count = 0
        if let files = try? fm.contentsOfDirectory(atPath: root.appendingPathComponent("Proyectos").path) { count = files.filter { $0.hasSuffix(".ffworkflow") }.count }
        if lastBackup == nil, let a = try? fm.attributesOfItem(atPath: root.appendingPathComponent("Proyectos").path), let m = a[.modificationDate] as? Date { lastBackup = m }
        var o: [String: Any] = ["enabled": enabled, "available": available, "count": count, "path": root.path]
        if let l = lastBackup { o["last"] = ISO8601DateFormatter().string(from: l) }
        if let e = lastError { o["error"] = e }
        return o
    }

    /// Debounced backup after a change
    func schedule() {
        guard enabled, available else { return }
        pending?.cancel()
        let w = DispatchWorkItem { [weak self] in self?.run() }
        pending = w
        ioQueue.asyncAfter(deadline: .now() + 4, execute: w)
    }

    /// Copies changed files (runs on ioQueue)
    @discardableResult
    func run() -> Bool {
        guard available else { lastError = "iCloud Drive no está disponible"; return false }
        do {
            let dst = root.appendingPathComponent("Proyectos", isDirectory: true)
            try fm.createDirectory(at: dst, withIntermediateDirectories: true)
            for f in try fm.contentsOfDirectory(at: libraryURL, includingPropertiesForKeys: [.contentModificationDateKey]) {
                try copyIfChanged(f, to: dst.appendingPathComponent(f.lastPathComponent))
            }
            if fm.fileExists(atPath: baseTemplateURL.path) { try copyIfChanged(baseTemplateURL, to: root.appendingPathComponent(baseTemplateURL.lastPathComponent)) }
            try snapshot()
            syncWorkflows()
            lastBackup = Date(); lastError = nil
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func copyIfChanged(_ src: URL, to dst: URL) throws {
        if fm.fileExists(atPath: dst.path) {
            let a = try? fm.attributesOfItem(atPath: src.path), b = try? fm.attributesOfItem(atPath: dst.path)
            if let sa = a?[.size] as? Int, let sb = b?[.size] as? Int, sa == sb,
               let ma = a?[.modificationDate] as? Date, let mb = b?[.modificationDate] as? Date, mb >= ma { return }
            try fm.removeItem(at: dst)
        }
        try fm.copyItem(at: src, to: dst)
    }

    func snapshot() throws {
        let hist = root.appendingPathComponent("Historial", isDirectory: true)
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
        let today = hist.appendingPathComponent(df.string(from: Date()), isDirectory: true)
        try fm.createDirectory(at: today, withIntermediateDirectories: true)
        // today's folder always holds the latest state of the day
        for f in try fm.contentsOfDirectory(at: libraryURL, includingPropertiesForKeys: nil) where f.pathExtension == "ffworkflow" {
            try copyIfChanged(f, to: today.appendingPathComponent(f.lastPathComponent))
        }
        let days = (try? fm.contentsOfDirectory(atPath: hist.path))?.filter { !$0.hasPrefix(".") }.sorted() ?? []
        if days.count > 30 { for d in days.prefix(days.count - 30) { try? fm.removeItem(at: hist.appendingPathComponent(d)) } }
    }

    func archiveDeleted(_ id: String) {
        guard enabled, available else { return }
        ioQueue.async {
            let src = self.root.appendingPathComponent("Proyectos/\(id).ffworkflow")
            guard self.fm.fileExists(atPath: src.path) else { return }
            let del = self.root.appendingPathComponent("Eliminados", isDirectory: true)
            try? self.fm.createDirectory(at: del, withIntermediateDirectories: true)
            let df = DateFormatter(); df.dateFormat = "yyyyMMdd-HHmm"
            try? self.fm.moveItem(at: src, to: del.appendingPathComponent("\(id)-\(df.string(from: Date())).ffworkflow"))
            try? self.fm.removeItem(at: self.root.appendingPathComponent("Proyectos/\(id).meta.json"))
        }
    }

    // MARK: Two-way sync with iCloud Drive/FilmFlow Workflow/Workflows (readable names, used from iPhone/iPad)
    var headerCache: [String: (Date, String, String)] = [:]   // path -> (mtime, id, updatedAt)
    var onExternalUpdate: (([String]) -> Void)?
    var workflowsDir: URL { root.appendingPathComponent("Workflows", isDirectory: true) }

    func syncName(_ o: [String: Any]) -> String {
        let n = "\(o["name"] as? String ?? "Proyecto") \(o["version"] as? String ?? "")".trimmingCharacters(in: .whitespaces)
        let bad = CharacterSet(charactersIn: "\\/:*?\"<>|")
        let clean = n.components(separatedBy: bad).joined(separator: "-")
        return clean.isEmpty ? "Proyecto" : clean
    }

    func header(_ u: URL) -> (String, String)? {
        guard let m = (try? fm.attributesOfItem(atPath: u.path))?[.modificationDate] as? Date else { return nil }
        if let c = headerCache[u.path], c.0 == m { return (c.1, c.2) }
        guard let d = try? Data(contentsOf: u), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let id = o["id"] as? String else { return nil }
        let up = o["updatedAt"] as? String ?? ""   // files without a stamp never override the library
        headerCache[u.path] = (m, id, up)
        return (id, up)
    }

    func metaFor(json: Data) -> Data? {
        guard let o = try? JSONSerialization.jsonObject(with: json) as? [String: Any] else { return nil }
        let secs = o["sections"] as? [[String: Any]] ?? []
        let meta: [String: Any] = ["id": o["id"] ?? "", "name": o["name"] ?? "Sin nombre", "code": o["code"] ?? "", "client": o["client"] ?? "",
                                   "version": o["version"] ?? "", "docTitle": o["docTitle"] ?? "", "date": o["date"] ?? "", "theme": o["theme"] ?? "dark", "accent": o["accent"] ?? "#37A14F",
                                   "sections": secs.count, "active": secs.filter { ($0["hidden"] as? Bool) != true }.count,
                                   "modified": o["updatedAt"] ?? ISO8601DateFormatter().string(from: Date())]
        return try? JSONSerialization.data(withJSONObject: meta)
    }

    func moveToDeleted(_ u: URL) {
        let del = root.appendingPathComponent("Eliminados", isDirectory: true)
        try? fm.createDirectory(at: del, withIntermediateDirectories: true)
        let df = DateFormatter(); df.dateFormat = "yyyyMMdd-HHmmss"
        try? fm.moveItem(at: u, to: del.appendingPathComponent("\(u.deletingPathExtension().lastPathComponent) \(df.string(from: Date())).ffworkflow"))
    }

    /// Runs on ioQueue. Pulls newer copies saved from iPhone/iPad and pushes the library's newer projects.
    func syncWorkflows() {
        guard enabled, available else { return }
        try? fm.createDirectory(at: workflowsDir, withIntermediateDirectories: true)
        let entries = (try? fm.contentsOfDirectory(at: workflowsDir, includingPropertiesForKeys: nil, options: [])) ?? []
        // ask iCloud to download evicted placeholders (".Name.ffworkflow.icloud")
        for e in entries where e.lastPathComponent.hasPrefix(".") && e.lastPathComponent.hasSuffix(".ffworkflow.icloud") {
            var name = e.lastPathComponent; name.removeFirst(); name.removeLast(".icloud".count)
            try? fm.startDownloadingUbiquitousItem(at: workflowsDir.appendingPathComponent(name))
        }
        var files: [String: (URL, String)] = [:]
        for u in entries where u.pathExtension == "ffworkflow" && !u.lastPathComponent.hasPrefix(".") {
            guard let (id, up) = header(u) else { continue }
            if let prev = files[id] {
                // "Keep both" duplicates from the Files app: keep the newest
                if up > prev.1 { moveToDeleted(prev.0); files[id] = (u, up) } else { moveToDeleted(u) }
            } else { files[id] = (u, up) }
        }
        var lib: [String: [String: Any]] = [:]
        for f in (try? fm.contentsOfDirectory(at: libraryURL, includingPropertiesForKeys: nil)) ?? [] where f.lastPathComponent.hasSuffix(".meta.json") {
            if let d = try? Data(contentsOf: f), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let id = o["id"] as? String { lib[id] = o }
        }
        var pulled: [String] = []
        for (id, f) in files {
            let localUp = lib[id]?["modified"] as? String ?? ""
            if lib[id] == nil || f.1 > localUp {
                guard let d = try? Data(contentsOf: f.0), let meta = metaFor(json: d) else { continue }
                let sid = safeID(id)
                try? d.write(to: libraryURL.appendingPathComponent("\(sid).ffworkflow"), options: .atomic)
                try? meta.write(to: libraryURL.appendingPathComponent("\(sid).meta.json"), options: .atomic)
                if let o = try? JSONSerialization.jsonObject(with: meta) as? [String: Any] { lib[id] = o }
                pulled.append(id)
            }
        }
        var usedNames = Set(files.values.map { $0.0.lastPathComponent })
        for (id, m) in lib {
            let up = m["modified"] as? String ?? ""
            let f = files[id]
            if let f, f.1 >= up { continue }
            let src = libraryURL.appendingPathComponent("\(safeID(id)).ffworkflow")
            guard fm.fileExists(atPath: src.path) else { continue }
            var name = syncName(m) + ".ffworkflow"
            if let f { usedNames.remove(f.0.lastPathComponent) }
            if usedNames.contains(name) { name = syncName(m) + " (\(id.prefix(4))).ffworkflow" }
            let dst = workflowsDir.appendingPathComponent(name)
            if let f, f.0 != dst { try? fm.removeItem(at: f.0) }
            try? fm.removeItem(at: dst)
            // stamp the copy with the library's edit time so both sides agree on which one is newer
            if var o = (try? Data(contentsOf: src)).flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }) {
                if (o["updatedAt"] as? String ?? "").isEmpty { o["updatedAt"] = up }
                if let d = try? JSONSerialization.data(withJSONObject: o) { try? d.write(to: dst, options: .atomic) }
            } else { try? fm.copyItem(at: src, to: dst) }
            usedNames.insert(name)
        }
        if !pulled.isEmpty { DispatchQueue.main.async { self.onExternalUpdate?(pulled) } }
    }

    func removeFromWorkflows(_ id: String) {
        guard enabled, available else { return }
        ioQueue.async {
            for u in (try? self.fm.contentsOfDirectory(at: self.workflowsDir, includingPropertiesForKeys: nil)) ?? [] where u.pathExtension == "ffworkflow" {
                if let (fid, _) = self.header(u), fid == id { self.moveToDeleted(u) }
            }
        }
    }

    /// Projects available in the iCloud copy (meta + whether they exist locally)
    func restoreList() -> [[String: Any]] {
        let dir = root.appendingPathComponent("Proyectos")
        let files = (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        var out: [[String: Any]] = []
        for f in files where f.lastPathComponent.hasSuffix(".meta.json") {
            guard let d = try? Data(contentsOf: f), var o = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let id = o["id"] as? String else { continue }
            o["local"] = fm.fileExists(atPath: libraryURL.appendingPathComponent("\(safeID(id)).ffworkflow").path)
            out.append(o)
        }
        return out
    }

    func restore(_ ids: [String]) -> Int {
        var n = 0
        for raw in ids {
            let id = safeID(raw)
            for ext in ["ffworkflow", "meta.json"] {
                let src = root.appendingPathComponent("Proyectos/\(id).\(ext)"), dst = libraryURL.appendingPathComponent("\(id).\(ext)")
                guard fm.fileExists(atPath: src.path) else { continue }
                try? fm.removeItem(at: dst)
                if (try? fm.copyItem(at: src, to: dst)) != nil, ext == "ffworkflow" { n += 1 }
            }
        }
        return n
    }
}
let webRoot = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
let verbose = CommandLine.arguments.contains("--export")
let docType = UTType(exportedAs: "com.filmflowtv.workflow.project", conformingTo: .json)

// MARK: - PDF export (offscreen web view, one page at a time so portrait and landscape pages can be mixed)

final class PDFExporter: NSObject, WKNavigationDelegate {
    let web: WKWebView
    let window: NSWindow
    let json: String
    let completion: (Data?, String?) -> Void
    var output = PDFDocument()

    init(json: String, completion: @escaping (Data?, String?) -> Void) {
        self.json = json
        self.completion = completion
        let cfg = WKWebViewConfiguration()
        cfg.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        cfg.userContentController.addUserScript(WKUserScript(source: "window.FF_EXPORT = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1100, height: 1100), configuration: cfg)
        window = NSWindow(contentRect: NSRect(x: -5000, y: -5000, width: 1100, height: 1100),
                          styleMask: [.borderless], backing: .buffered, defer: false)
        super.init()
        window.contentView = web
        window.orderBack(nil)
        web.navigationDelegate = self
        web.loadFileURL(webRoot.appendingPathComponent("index.html"), allowingReadAccessTo: webRoot)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if verbose { print("loaded") }
        web.callAsyncJavaScript("return await window.prepareExport(p)", arguments: ["p": json], in: nil, in: .page) { r in
            switch r {
            case .success(let v):
                let n = (v as? NSNumber)?.intValue ?? 0
                if verbose { print("pages", n) }
                self.renderPage(0, of: n)
            case .failure(let e):
                self.finish(nil, e.localizedDescription)
            }
        }
    }

    func renderPage(_ i: Int, of n: Int) {
        if verbose { print("page", i) }
        if i >= n { finish(output.dataRepresentation(), nil); return }
        web.callAsyncJavaScript("return await window.showExportPage(i)", arguments: ["i": i], in: nil, in: .page) { r in
            guard case .success(let v) = r, let d = v as? [String: Any],
                  let w = (d["w"] as? NSNumber)?.doubleValue, let h = (d["h"] as? NSNumber)?.doubleValue else {
                self.finish(nil, "No se pudo preparar la página \(i + 1)"); return
            }
            if verbose, let imgs = d["imgs"] as? [Any], !imgs.isEmpty { print("  images", imgs) }
            let conf = WKPDFConfiguration()
            conf.rect = CGRect(x: 0, y: 0, width: w, height: h)
            self.web.createPDF(configuration: conf) { res in
                switch res {
                case .success(let data):
                    if let doc = PDFDocument(data: data), let page = doc.page(at: 0) {
                        self.output.insert(page, at: self.output.pageCount)
                    }
                    self.renderPage(i + 1, of: n)
                case .failure(let e):
                    self.finish(nil, e.localizedDescription)
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(nil, "nav: \(error)") }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(nil, "prov: \(error)") }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { finish(nil, "web process terminated") }

    func finish(_ data: Data?, _ err: String?) {
        window.orderOut(nil)
        completion(data, err)
    }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandlerWithReply, WKUIDelegate, WKNavigationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var currentURL: URL?
    var exporter: PDFExporter?
    var pendingOpen: URL?
    var pageLoaded = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Headless test mode: FilmFlowWorkflow --export in.json out.pdf
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--export"), args.count > i + 2 {
            let json = (try? String(contentsOfFile: args[i + 1], encoding: .utf8)) ?? ""
            exporter = PDFExporter(json: json) { data, err in
                if let data { try? data.write(to: URL(fileURLWithPath: args[i + 2])); print("OK") }
                else { print("ERROR", err ?? "") }
                NSApp.terminate(nil)
            }
            return
        }

        buildMenu()
        ICloudBackup.shared.schedule()
        ICloudBackup.shared.onExternalUpdate = { [weak self] ids in
            for id in ids { self?.web.evaluateJavaScript("window.onExternalUpdate && window.onExternalUpdate('\(safeID(id))')", completionHandler: nil) }
        }
        Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { _ in ioQueue.async { ICloudBackup.shared.syncWorkflows() } }
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            ioQueue.async { ICloudBackup.shared.syncWorkflows() }
        }
        let cfg = WKWebViewConfiguration()
        cfg.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "native")
        web = WKWebView(frame: .zero, configuration: cfg)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")

        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1500, height: 950)
        let size = NSSize(width: min(1560, screen.width * 0.94), height: min(980, screen.height * 0.94))
        window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "FilmFlow Workflow"
        window.minSize = NSSize(width: 1100, height: 700)
        window.contentView = web
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("MainWindow")
        window.makeKeyAndOrderFront(nil)
        web.loadFileURL(webRoot.appendingPathComponent("index.html"), allowingReadAccessTo: webRoot)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let u = urls.first else { return }
        if pageLoaded { openFile(u) } else { pendingOpen = u }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        if let u = pendingOpen { pendingOpen = nil; openFile(u) }
    }

    func openFile(_ u: URL) {
        guard let s = try? String(contentsOf: u, encoding: .utf8) else { return }
        currentURL = u
        web.callAsyncJavaScript("window.loadProjectFromNative(s, n)", arguments: ["s": s, "n": u.lastPathComponent], in: nil, in: .page, completionHandler: nil)
    }

    // File inputs (<input type=file>) inside the web view
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel()
        p.allowsMultipleSelection = parameters.allowsMultipleSelection
        p.canChooseDirectories = false
        p.allowedContentTypes = [.image]
        p.beginSheetModal(for: window) { r in completionHandler(r == .OK ? p.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "Aceptar")
        a.addButton(withTitle: "Cancelar")
        a.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.beginSheetModal(for: window) { _ in completionHandler() }
    }

    // MARK: Bridge  — JS: await window.webkit.messageHandlers.native.postMessage({cmd, ...})
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else {
            replyHandler(nil, "bad message"); return
        }
        let json = body["json"] as? String ?? ""
        let name = body["name"] as? String ?? "Workflow"
        switch cmd {
        case "loadAutosave":
            replyHandler(try? String(contentsOf: autosaveURL, encoding: .utf8), nil)
        case "autosave":
            try? json.write(to: autosaveURL, atomically: true, encoding: .utf8)
            replyHandler(true, nil)
        case "loadBaseTemplate":
            replyHandler(try? String(contentsOf: baseTemplateURL, encoding: .utf8), nil)
        case "saveBaseTemplate":
            try? json.write(to: baseTemplateURL, atomically: true, encoding: .utf8)
            ICloudBackup.shared.schedule()
            replyHandler(true, nil)
        case "resetBaseTemplate":
            try? FileManager.default.removeItem(at: baseTemplateURL)
            replyHandler(true, nil)
        case "libList":
            ioQueue.async {
                let fm = FileManager.default
                let files = (try? fm.contentsOfDirectory(at: libraryURL, includingPropertiesForKeys: nil)) ?? []
                var out: [[String: Any]] = []
                for f in files where f.lastPathComponent.hasSuffix(".meta.json") {
                    if let d = try? Data(contentsOf: f), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { out.append(o) }
                }
                DispatchQueue.main.async { replyHandler(out, nil) }
            }
        case "libSave":
            let id = safeID(body["id"] as? String ?? "")
            let meta = body["meta"] as? String ?? "{}"
            guard !id.isEmpty else { replyHandler(nil, "id vacío"); return }
            ioQueue.async {
                do {
                    try json.write(to: libraryURL.appendingPathComponent("\(id).ffworkflow"), atomically: true, encoding: .utf8)
                    try meta.write(to: libraryURL.appendingPathComponent("\(id).meta.json"), atomically: true, encoding: .utf8)
                    try? id.write(to: lastProjectURL, atomically: true, encoding: .utf8)
                    ICloudBackup.shared.schedule()
                    DispatchQueue.main.async { replyHandler(true, nil) }
                } catch {
                    DispatchQueue.main.async { replyHandler(nil, error.localizedDescription) }
                }
            }
        case "libLoad":
            let id = safeID(body["id"] as? String ?? "")
            ioQueue.async {
                let s = try? String(contentsOf: libraryURL.appendingPathComponent("\(id).ffworkflow"), encoding: .utf8)
                DispatchQueue.main.async { replyHandler(s, nil) }
            }
        case "libDelete":
            let id = safeID(body["id"] as? String ?? "")
            for ext in ["ffworkflow", "meta.json"] {
                let u = libraryURL.appendingPathComponent("\(id).\(ext)")
                if FileManager.default.fileExists(atPath: u.path) { try? FileManager.default.trashItem(at: u, resultingItemURL: nil) }
            }
            ICloudBackup.shared.archiveDeleted(id)
            ICloudBackup.shared.removeFromWorkflows(id)
            replyHandler(true, nil)
        case "backupStatus":
            ioQueue.async { let st = ICloudBackup.shared.status(); DispatchQueue.main.async { replyHandler(st, nil) } }
        case "backupSet":
            ICloudBackup.shared.enabled = body["enabled"] as? Bool ?? true
            if ICloudBackup.shared.enabled { ICloudBackup.shared.schedule() }
            replyHandler(true, nil)
        case "backupNow":
            ioQueue.async {
                let ok = ICloudBackup.shared.run()
                let st = ICloudBackup.shared.status()
                DispatchQueue.main.async { ok ? replyHandler(st, nil) : replyHandler(nil, ICloudBackup.shared.lastError ?? "Error") }
            }
        case "backupList":
            ioQueue.async { let l = ICloudBackup.shared.restoreList(); DispatchQueue.main.async { replyHandler(l, nil) } }
        case "backupRestore":
            let ids = body["ids"] as? [String] ?? []
            ioQueue.async { let n = ICloudBackup.shared.restore(ids); DispatchQueue.main.async { replyHandler(n, nil) } }
        case "backupReveal":
            let r = ICloudBackup.shared.root
            try? FileManager.default.createDirectory(at: r, withIntermediateDirectories: true)
            NSWorkspace.shared.activateFileViewerSelecting([r])
            replyHandler(true, nil)
        case "libLast":
            replyHandler(try? String(contentsOf: lastProjectURL, encoding: .utf8), nil)
        case "exportFile":
            let p = NSSavePanel()
            p.allowedContentTypes = [docType]
            p.nameFieldStringValue = name + ".ffworkflow"
            p.beginSheetModal(for: window) { r in
                guard r == .OK, let u = p.url else { replyHandler(nil, nil); return }
                do { try json.write(to: u, atomically: true, encoding: .utf8); replyHandler(u.lastPathComponent, nil) }
                catch { replyHandler(nil, error.localizedDescription) }
            }
        case "newDocument":
            currentURL = nil
            replyHandler(true, nil)
        case "save":
            let saveAs = body["saveAs"] as? Bool ?? false
            if let u = currentURL, !saveAs {
                do { try json.write(to: u, atomically: true, encoding: .utf8); replyHandler(u.lastPathComponent, nil) }
                catch { replyHandler(nil, error.localizedDescription) }
                return
            }
            let p = NSSavePanel()
            p.allowedContentTypes = [docType]
            p.nameFieldStringValue = name + ".ffworkflow"
            p.beginSheetModal(for: window) { r in
                guard r == .OK, let u = p.url else { replyHandler(nil, nil); return }
                do {
                    try json.write(to: u, atomically: true, encoding: .utf8)
                    self.currentURL = u
                    replyHandler(u.lastPathComponent, nil)
                } catch { replyHandler(nil, error.localizedDescription) }
            }
        case "open":
            let p = NSOpenPanel()
            p.allowedContentTypes = [docType, .json]
            p.beginSheetModal(for: window) { r in
                guard r == .OK, let u = p.url, let s = try? String(contentsOf: u, encoding: .utf8) else { replyHandler(nil, nil); return }
                self.currentURL = u
                replyHandler(["json": s, "name": u.lastPathComponent], nil)
            }
        case "exportPDF":
            let p = NSSavePanel()
            p.allowedContentTypes = [.pdf]
            p.nameFieldStringValue = name + ".pdf"
            p.beginSheetModal(for: window) { r in
                guard r == .OK, let u = p.url else { replyHandler(nil, nil); return }
                self.exporter = PDFExporter(json: json) { data, err in
                    self.exporter = nil
                    guard let data else { replyHandler(nil, err ?? "Error al exportar"); return }
                    do {
                        try data.write(to: u)
                        replyHandler(u.path, nil)
                    } catch { replyHandler(nil, error.localizedDescription) }
                }
            }
        case "openPath":
            if let path = body["path"] as? String { NSWorkspace.shared.open(URL(fileURLWithPath: path)) }
            replyHandler(true, nil)
        case "revealPath":
            if let path = body["path"] as? String { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)]) }
            replyHandler(true, nil)
        case "setTitle":
            window.title = name
            replyHandler(true, nil)
        default:
            replyHandler(nil, "unknown command")
        }
    }

    // MARK: Menu — shortcuts are forwarded to the web app
    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Acerca de FilmFlow Workflow", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Ocultar", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Salir", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let fileItem = NSMenuItem(); main.addItem(fileItem)
        let fileMenu = NSMenu(title: "Archivo")
        func add(_ t: String, _ k: String, _ a: String, _ mods: NSEvent.ModifierFlags = .command) {
            let it = NSMenuItem(title: t, action: #selector(menuAction(_:)), keyEquivalent: k)
            it.keyEquivalentModifierMask = mods
            it.representedObject = a
            it.target = self
            fileMenu.addItem(it)
        }
        add("Mis proyectos", "p", "library")
        add("Nuevo proyecto", "n", "new")
        add("Importar archivo…", "o", "open")
        add("Guardar", "s", "save")
        add("Exportar archivo .ffworkflow…", "s", "saveAs", [.command, .shift])
        fileMenu.addItem(.separator())
        add("Exportar PDF…", "e", "export")
        fileItem.submenu = fileMenu

        let editItem = NSMenuItem(); main.addItem(editItem)
        let editMenu = NSMenu(title: "Edición")
        editMenu.addItem(withTitle: "Deshacer", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Rehacer", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cortar", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copiar", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Pegar", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Seleccionar todo", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu

        let winItem = NSMenuItem(); main.addItem(winItem)
        let winMenu = NSMenu(title: "Ventana")
        winMenu.addItem(withTitle: "Minimizar", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        winMenu.addItem(withTitle: "Pantalla completa", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        winItem.submenu = winMenu
        NSApp.mainMenu = main
    }

    @objc func menuAction(_ sender: NSMenuItem) {
        guard let a = sender.representedObject as? String else { return }
        web.evaluateJavaScript("window.menuCommand && window.menuCommand('\(a)')", completionHandler: nil)
    }
}

setvbuf(stdout, nil, _IONBF, 0)
let activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .latencyCritical], reason: "FilmFlow Workflow")
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(CommandLine.arguments.contains("--export") ? .accessory : .regular)
app.run()
