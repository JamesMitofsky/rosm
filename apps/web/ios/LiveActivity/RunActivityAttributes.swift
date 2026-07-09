import ActivityKit
import Foundation

// Live Activity data model for an active run. Shared by BOTH targets: the app
// (RunActivityPlugin starts/updates it) and the widget extension (renders it).
// Add this file to both target memberships — see SETUP.md.
struct RunActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var nextName: String      // name of the point being navigated to
        var distanceToNext: Int   // meters; -1 when unknown
        var stopsRemaining: Int
        var totalStops: Int
    }
}
