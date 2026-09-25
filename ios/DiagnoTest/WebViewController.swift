import UIKit
import WebKit

/// Affiche le site DiagnoTest embarqué (dossier « www » du bundle) et relaie les appels du pont natif.
///
/// La page est chargée en `file://`, que WebKit considère comme un contexte sécurisé : la caméra,
/// le micro et la géolocalisation y fonctionnent. Le script injecté par `Bridge` expose
/// `window.DiagnoNative`, avec les mêmes méthodes que le pont Android.
final class WebViewController: UIViewController, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var webView: WKWebView!
    private var normalConstraints: [NSLayoutConstraint] = []
    private var immersiveConstraints: [NSLayoutConstraint] = []
    private var immersive = false
    private var lightBackground = true
    private let haptics = Haptics()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: "#0e0e0e")! : UIColor(hex: "#f8f8f7")!
        }
        lightBackground = traitCollection.userInterfaceStyle != .dark

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let content = config.userContentController
        content.add(WeakMessageHandler(self), name: "diag")
        content.addUserScript(WKUserScript(source: Bridge.bootstrapScript(),
                                           injectionTime: .atDocumentStart, forMainFrameOnly: true))

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true } // Safari → Développement
        #endif
        view.addSubview(webView)

        let safe = view.safeAreaLayoutGuide
        normalConstraints = [
            webView.topAnchor.constraint(equalTo: safe.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
        ]
        immersiveConstraints = [
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ]
        NSLayoutConstraint.activate(normalConstraints)

        UIDevice.current.isBatteryMonitoringEnabled = true
        for name in [UIDevice.batteryLevelDidChangeNotification, UIDevice.batteryStateDidChangeNotification,
                     ProcessInfo.thermalStateDidChangeNotification, Notification.Name.NSProcessInfoPowerStateDidChange] {
            NotificationCenter.default.addObserver(self, selector: #selector(pushBattery), name: name, object: nil)
        }

        loadPage()
    }

    private func loadPage() {
        guard let www = Bundle.main.url(forResource: "www", withExtension: nil) else { return }
        var url = www.appendingPathComponent("index.html")
        // Argument de lancement « -anchor t-battery » : ouvre directement une section (tests automatisés).
        if let anchor = UserDefaults.standard.string(forKey: "anchor"),
           var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            parts.fragment = anchor
            url = parts.url ?? url
        }
        webView.loadFileURL(url, allowingReadAccessTo: www)
    }

    @objc private func pushBattery() {
        DispatchQueue.main.async {
            let js = "window.__diagIOS && (window.__diagIOS.battery = \(Bridge.json(DeviceInfo.battery())));"
            self.webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    // MARK: - Barre d'état et mode immersif (mires plein écran)

    override var preferredStatusBarStyle: UIStatusBarStyle { lightBackground ? .darkContent : .lightContent }
    override var prefersStatusBarHidden: Bool { immersive }
    override var prefersHomeIndicatorAutoHidden: Bool { immersive }

    private func setImmersive(_ on: Bool) {
        guard on != immersive else { return }
        immersive = on
        NSLayoutConstraint.deactivate(on ? normalConstraints : immersiveConstraints)
        NSLayoutConstraint.activate(on ? immersiveConstraints : normalConstraints)
        webView.scrollView.contentInsetAdjustmentBehavior = on ? .never : .automatic
        setNeedsStatusBarAppearanceUpdate()
        setNeedsUpdateOfHomeIndicatorAutoHidden()
    }

    // MARK: - Messages du pont JavaScript

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "vibrate":
            let pattern = (body["pattern"] as? [NSNumber])?.map { $0.doubleValue } ?? [300]
            haptics.play(pattern: pattern)
        case "save":
            guard let name = body["name"] as? String, let text = body["content"] as? String else { return }
            let file = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            do {
                try text.write(to: file, atomically: true, encoding: .utf8)
                share([file])
            } catch {
                share([text])
            }
        case "share":
            share([body["text"] as? String ?? ""])
        case "barColor":
            if let hex = body["color"] as? String, let color = UIColor(hex: hex) {
                view.backgroundColor = color
                lightBackground = color.luminance > 0.5
                setNeedsStatusBarAppearanceUpdate()
            }
        case "immersive":
            setImmersive(body["on"] as? Bool ?? false)
        case "log":
            NSLog("[DiagnoTest JS] %@", body["message"] as? String ?? "")
        default:
            break
        }
    }

    /// Feuille de partage : « Enregistrer dans Fichiers », AirDrop, Mail, Messages…
    private func share(_ items: [Any]) {
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        if let popover = sheet.popoverPresentationController { // iPad
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        present(sheet, animated: true)
    }

    // MARK: - Permissions (caméra, micro, capteurs) et boîtes de dialogue JavaScript

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant) // iOS affiche ensuite sa propre demande d'autorisation (textes dans Info.plist)
    }

    func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Continuer", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    // MARK: - Navigation : les liens externes s'ouvrent dans Safari

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }
}

/// Évite le cycle de rétention WKUserContentController → contrôleur.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

extension UIColor {
    /// « #rrggbb » ou « #rgb », comme dans les variables CSS du site.
    convenience init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
                  blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }

    var luminance: CGFloat {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return 0.299 * r + 0.587 * g + 0.114 * b
    }
}
