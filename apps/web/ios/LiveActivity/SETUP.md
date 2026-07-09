# Live Activity + Dynamic Island — Xcode setup

The JS side (`lib/liveActivity.ts`, wired in `hooks/useRunSession.ts`) is already
done and is a **no-op until these native pieces are added**. Adding a Widget
Extension target is a one-time Xcode-GUI step that can't be scripted safely, so do
it once here. iOS 16.1+ (Dynamic Island: iPhone 14 Pro+/15 Pro+ and the matching
simulators).

## 1. Add the Widget Extension target
`open ios/App/App.xcodeproj` → File → New → Target… → **Widget Extension**.
- Product name: `RunActivityWidget`
- **Check "Include Live Activity"**; uncheck "Include Configuration App Intent".
- Finish → "Activate scheme?" → cancel (keep the `App` scheme).
- Set the target's **Minimum Deployments = iOS 16.1**.

## 2. Place the source files (from this folder)
- `RunActivityAttributes.swift` → target membership: **App + RunActivityWidget** (both).
- `RunActivityLiveActivity.swift` → **RunActivityWidget** only.
- `RunActivityPlugin.swift` → **App** only.

Drag them into the project navigator (or "Add Files to App…") and tick the right
targets in the File Inspector. Delete the placeholder files Xcode generated for the
widget except its `@main` bundle.

## 3. Register the widget
In the generated `RunActivityWidgetBundle.swift` (the `@main` struct), make the body:

```swift
@main
struct RunActivityWidgetBundle: WidgetBundle {
    var body: some Widget {
        RunActivityLiveActivity()
    }
}
```

## 4. Plist
`NSSupportsLiveActivities = YES` is already set in `App/Info.plist`. No change needed.

## 5. Build & test
`App` scheme → run on an iOS 16.1+ device or an iPhone 15 Pro+/17 Pro simulator.
Start a run; the Live Activity appears on the lock screen and in the Dynamic Island,
updating as you approach each point and ending when the run finishes.

## Notes
- `cap sync` / `cap copy` won't touch this target, so it survives Capacitor rebuilds.
- For background updates while the app is suspended for long stretches, add an APNs
  push token to the activity later — in-app + background-GPS updates cover an active run.
