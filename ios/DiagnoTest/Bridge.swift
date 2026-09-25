import UIKit
import AVFoundation
import AudioToolbox
import CoreHaptics
import CoreMotion
import LocalAuthentication

/// Script injecté au début de chaque page : expose `window.DiagnoNative`, avec la même interface que
/// le pont Android (DiagnoBridge.java), pour que js/app.js n'ait qu'un seul chemin de code.
///
/// Les appels vers Swift passent par `webkit.messageHandlers` et sont asynchrones. Les lectures
/// (appareil, batterie) sont donc servies depuis `window.__diagIOS`, rempli à l'injection puis mis à
/// jour par `WebViewController.pushBattery()` à chaque changement.
enum Bridge {
    static func bootstrapScript() -> String {
        """
        window.__diagIOS = { device: \(json(DeviceInfo.device())), battery: \(json(DeviceInfo.battery())) };
        (function () {
          var post = function (msg) { window.webkit.messageHandlers.diag.postMessage(msg); };
          window.DiagnoNative = {
            platform: function () { return 'ios'; },
            getDeviceInfo: function () { return JSON.stringify(window.__diagIOS.device); },
            getBatteryInfo: function () { return window.__diagIOS.battery ? JSON.stringify(window.__diagIOS.battery) : null; },
            vibrate: function (pattern) { post({ cmd: 'vibrate', pattern: JSON.parse(pattern) }); return true; },
            saveFile: function (name, content, mime) { post({ cmd: 'save', name: name, content: content, mime: mime }); return 'Partage'; },
            shareText: function (title, text) { post({ cmd: 'share', title: title, text: text }); },
            setSystemBarColor: function (color) { post({ cmd: 'barColor', color: color }); },
            setImmersive: function (on) { post({ cmd: 'immersive', on: !!on }); }
          };
          window.addEventListener('error', function (e) { post({ cmd: 'log', message: e.message + ' @' + e.lineno }); });
        })();
        """
    }

    static func json(_ object: Any) -> String {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object),
              let text = String(data: data, encoding: .utf8) else { return "null" }
        return text
    }
}

enum DeviceInfo {
    /// Identifiant matériel (« iPhone15,2 ») ; dans le simulateur, celui de l'appareil simulé.
    static func identifier() -> String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated }
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { raw in
            String(decoding: raw.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
    }

    /// Nom commercial et puce. Un modèle absent de la table affiche son identifiant.
    static let models: [String: (name: String, chip: String)] = [
        "iPhone12,1": ("iPhone 11", "A13 Bionic"), "iPhone12,3": ("iPhone 11 Pro", "A13 Bionic"),
        "iPhone12,5": ("iPhone 11 Pro Max", "A13 Bionic"), "iPhone12,8": ("iPhone SE (2e génération)", "A13 Bionic"),
        "iPhone13,1": ("iPhone 12 mini", "A14 Bionic"), "iPhone13,2": ("iPhone 12", "A14 Bionic"),
        "iPhone13,3": ("iPhone 12 Pro", "A14 Bionic"), "iPhone13,4": ("iPhone 12 Pro Max", "A14 Bionic"),
        "iPhone14,4": ("iPhone 13 mini", "A15 Bionic"), "iPhone14,5": ("iPhone 13", "A15 Bionic"),
        "iPhone14,2": ("iPhone 13 Pro", "A15 Bionic"), "iPhone14,3": ("iPhone 13 Pro Max", "A15 Bionic"),
        "iPhone14,6": ("iPhone SE (3e génération)", "A15 Bionic"),
        "iPhone14,7": ("iPhone 14", "A15 Bionic"), "iPhone14,8": ("iPhone 14 Plus", "A15 Bionic"),
        "iPhone15,2": ("iPhone 14 Pro", "A16 Bionic"), "iPhone15,3": ("iPhone 14 Pro Max", "A16 Bionic"),
        "iPhone15,4": ("iPhone 15", "A16 Bionic"), "iPhone15,5": ("iPhone 15 Plus", "A16 Bionic"),
        "iPhone16,1": ("iPhone 15 Pro", "A17 Pro"), "iPhone16,2": ("iPhone 15 Pro Max", "A17 Pro"),
        "iPhone17,3": ("iPhone 16", "A18"), "iPhone17,4": ("iPhone 16 Plus", "A18"),
        "iPhone17,1": ("iPhone 16 Pro", "A18 Pro"), "iPhone17,2": ("iPhone 16 Pro Max", "A18 Pro"),
        "iPhone17,5": ("iPhone 16e", "A18"),
        "iPhone18,3": ("iPhone 17", "A19"), "iPhone18,4": ("iPhone Air", "A19 Pro"),
        "iPhone18,1": ("iPhone 17 Pro", "A19 Pro"), "iPhone18,2": ("iPhone 17 Pro Max", "A19 Pro"),
        "iPhone18,5": ("iPhone 17e", ""), // puce non confirmée : seul le nom est affiché
    ]

    static func device() -> [String: Any] {
        let id = identifier()
        let known = models[id]
        let screen = UIScreen.main
        var o: [String: Any] = [
            "os": "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
            "manufacturer": "Apple",
            "model": known?.name ?? id,
            "identifier": id,
            "cores": ProcessInfo.processInfo.processorCount,
            "ramTotal": NSNumber(value: ProcessInfo.processInfo.physicalMemory),
            "screenWidth": Int(screen.nativeBounds.width),
            "screenHeight": Int(screen.nativeBounds.height),
            "maxRefreshRate": screen.maximumFramesPerSecond,
            "uptimeMs": Int(ProcessInfo.processInfo.systemUptime * 1000),
        ]
        if let chip = known?.chip, !chip.isEmpty {
            o["socManufacturer"] = "Apple"
            o["socModel"] = chip
        }
        if #available(iOS 16.0, *) { o["hdr"] = screen.potentialEDRHeadroom > 1 }

        let home = URL(fileURLWithPath: NSHomeDirectory())
        if let v = try? home.resourceValues(forKeys: [.volumeTotalCapacityKey, .volumeAvailableCapacityForImportantUsageKey]) {
            if let total = v.volumeTotalCapacity { o["storageTotal"] = total }
            if let free = v.volumeAvailableCapacityForImportantUsage { o["storageFree"] = NSNumber(value: free) }
        }

        // Capteurs : iOS ne liste pas ses capteurs, on teste la disponibilité de chacun.
        var sensors: [[String: Any]] = []
        let motion = CMMotionManager()
        if motion.isAccelerometerAvailable { sensors.append(["name": "Accéléromètre", "type": "accelerometer"]) }
        if motion.isGyroAvailable { sensors.append(["name": "Gyroscope", "type": "gyroscope"]) }
        if motion.isMagnetometerAvailable { sensors.append(["name": "Magnétomètre", "type": "magnetic_field"]) }
        if motion.isDeviceMotionAvailable { sensors.append(["name": "Fusion de capteurs", "type": "rotation_vector"]) }
        if CMAltimeter.isRelativeAltitudeAvailable() { sensors.append(["name": "Baromètre", "type": "pressure"]) }
        if CMPedometer.isStepCountingAvailable() { sensors.append(["name": "Podomètre", "type": "step_counter"]) }
        UIDevice.current.isProximityMonitoringEnabled = true
        if UIDevice.current.isProximityMonitoringEnabled { sensors.append(["name": "Proximité", "type": "proximity"]) }
        UIDevice.current.isProximityMonitoringEnabled = false
        o["sensors"] = sensors

        let isPhone = UIDevice.current.userInterfaceIdiom == .phone
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        o["features"] = [
            "telephony": isPhone,
            "wifi": true,
            "bluetoothLe": true,
            "gps": isPhone,
            "face": context.biometryType == .faceID,
            "fingerprint": context.biometryType == .touchID,
            "flash": AVCaptureDevice.default(for: .video)?.hasTorch ?? false,
        ]
        return o
    }

    /// iOS ne donne aux applications ni la température, ni la tension, ni la santé de la batterie.
    static func battery() -> [String: Any] {
        let d = UIDevice.current
        d.isBatteryMonitoringEnabled = true
        let thermal = ProcessInfo.processInfo.thermalState
        let thermalNames = ["Normal", "Tiède", "Élevé", "Critique"]
        return [
            "level": d.batteryLevel < 0 ? -1 : Int((d.batteryLevel * 100).rounded()),
            "scale": 100,
            "charging": d.batteryState == .charging || d.batteryState == .full,
            "plugged": 0,
            "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
            "thermalLevel": thermal.rawValue,
            "thermalState": thermalNames[min(thermal.rawValue, thermalNames.count - 1)],
            "healthNote": "Non communiquée aux applications par iOS : Réglages → Batterie → État de la batterie",
        ]
    }
}

/// Reproduit navigator.vibrate([vibration, pause, …]) avec Core Haptics,
/// ou avec la vibration système sur les appareils sans moteur haptique.
final class Haptics {
    private var engine: CHHapticEngine?

    func play(pattern: [Double]) {
        if CHHapticEngine.capabilitiesForHardware().supportsHaptics {
            do {
                if engine == nil {
                    engine = try CHHapticEngine()
                    engine?.resetHandler = { [weak self] in try? self?.engine?.start() }
                }
                try engine?.start()
                var events: [CHHapticEvent] = []
                var time = 0.0
                for (i, ms) in pattern.enumerated() {
                    let duration = max(0, ms) / 1000
                    if i % 2 == 0 && duration > 0 {
                        events.append(CHHapticEvent(eventType: .hapticContinuous, parameters: [
                            CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
                            CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
                        ], relativeTime: time, duration: duration))
                    }
                    time += duration
                }
                let player = try engine?.makePlayer(with: CHHapticPattern(events: events, parameters: []))
                try player?.start(atTime: CHHapticTimeImmediate)
                return
            } catch {
                // repli ci-dessous
            }
        }
        AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
    }
}
