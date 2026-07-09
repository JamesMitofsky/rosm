import ActivityKit
import SwiftUI
import WidgetKit

// Live Activity UI: lock-screen card + Dynamic Island. Add this file to the WIDGET
// EXTENSION target only, and include RunActivityLiveActivity() in the widget
// bundle's body (see SETUP.md). The volt accent matches the app theme.
private let volt = Color(red: 0.8, green: 1.0, blue: 0.18)

private func distanceText(_ meters: Int) -> String {
    if meters < 0 { return "—" }
    if meters >= 1000 { return String(format: "%.1f km", Double(meters) / 1000) }
    return "\(meters) m"
}

@available(iOS 16.1, *)
struct RunActivityLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RunActivityAttributes.self) { context in
            RunLockScreenView(state: context.state)
                .padding()
                .activityBackgroundTint(.black)
                .activitySystemActionForegroundColor(volt)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("\(context.state.stopsRemaining) left", systemImage: "drop.fill")
                        .font(.caption)
                        .foregroundStyle(volt)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(distanceText(context.state.distanceToNext))
                        .font(.caption).monospacedDigit().bold()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Next: \(context.state.nextName)")
                        .font(.headline).lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: "figure.run").foregroundStyle(volt)
            } compactTrailing: {
                Text(distanceText(context.state.distanceToNext)).monospacedDigit()
            } minimal: {
                Image(systemName: "figure.run").foregroundStyle(volt)
            }
            .keylineTint(volt)
        }
    }
}

@available(iOS 16.1, *)
private struct RunLockScreenView: View {
    let state: RunActivityAttributes.ContentState
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "figure.run").font(.title2).foregroundStyle(volt)
            VStack(alignment: .leading, spacing: 2) {
                Text("Next: \(state.nextName)").font(.headline).lineLimit(1)
                Text("\(state.stopsRemaining) of \(state.totalStops) points left")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(distanceText(state.distanceToNext)).font(.title3).monospacedDigit().bold()
        }
        .foregroundStyle(.white)
    }
}
