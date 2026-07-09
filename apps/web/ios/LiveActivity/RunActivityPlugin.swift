import ActivityKit
import Capacitor
import Foundation

// Capacitor bridge for the run Live Activity. JS side: lib/liveActivity.ts
// (jsName "RunActivity"). Add this file to the APP target only — see SETUP.md.
@objc(RunActivityPlugin)
public class RunActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RunActivityPlugin"
    public let jsName = "RunActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { return call.resolve() }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            return call.reject("Live Activities are disabled in Settings")
        }
        do {
            _ = try Activity<RunActivityAttributes>.request(
                attributes: RunActivityAttributes(),
                contentState: contentState(from: call),
                pushType: nil
            )
            call.resolve()
        } catch {
            call.reject("start failed: \(error.localizedDescription)")
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { return call.resolve() }
        let state = contentState(from: call)
        Task {
            for activity in Activity<RunActivityAttributes>.activities {
                await activity.update(using: state)
            }
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { return call.resolve() }
        Task {
            for activity in Activity<RunActivityAttributes>.activities {
                await activity.end(dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    @available(iOS 16.1, *)
    private func contentState(from call: CAPPluginCall) -> RunActivityAttributes.ContentState {
        RunActivityAttributes.ContentState(
            nextName: call.getString("nextName") ?? "Run",
            distanceToNext: call.getInt("distanceToNext") ?? -1,
            stopsRemaining: call.getInt("stopsRemaining") ?? 0,
            totalStops: call.getInt("totalStops") ?? 0
        )
    }
}
