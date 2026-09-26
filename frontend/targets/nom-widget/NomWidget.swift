import WidgetKit
import SwiftUI

// Nom widgets. All content comes from the App Group snapshot the app writes via the centralized Nom State Engine
// (src/widget-sync.tsx). The image is the exact Nom rendered in-app (same outfit renderer), so app and widget never drift.
// WidgetKit does not allow continuous animation on the Lock Screen; we show the current static pose and refresh when the
// app reloads timelines (after every summary/log change) plus a light hourly policy.

let appGroup = "group.com.emergent.healthbuddy.cfwaxa"

struct NomSnapshot: Codable {
    var nom_name: String = "Nom"
    var state: String = "neutral"
    var expression: String = "neutral"
    var body: String = "normal"
    var moods: String = ""
    var outfit: String = "outfit_none"
    var shape: String = "shape_round"
    var calories_consumed: Int = 0
    var calorie_goal: Int = 2000
    var protein_consumed: Int = 0
    var protein_goal: Int = 150
    var updated_at: String = ""
}

struct NomEntry: TimelineEntry {
    let date: Date
    let snapshot: NomSnapshot
    let image: UIImage?
}

func loadSnapshot() -> (NomSnapshot, UIImage?) {
    let defaults = UserDefaults(suiteName: appGroup)
    var snap = NomSnapshot()
    if let raw = defaults?.string(forKey: "nomSnapshot"), let data = raw.data(using: .utf8),
       let decoded = try? JSONDecoder().decode(NomSnapshot.self, from: data) {
        snap = decoded
    }
    var image: UIImage? = nil
    if let b64 = defaults?.string(forKey: "nomImage"), let data = Data(base64Encoded: b64) {
        image = UIImage(data: data)
    }
    return (snap, image)
}

struct NomProvider: TimelineProvider {
    func placeholder(in context: Context) -> NomEntry { NomEntry(date: Date(), snapshot: NomSnapshot(), image: nil) }
    func getSnapshot(in context: Context, completion: @escaping (NomEntry) -> Void) {
        let (s, img) = loadSnapshot()
        completion(NomEntry(date: Date(), snapshot: s, image: img))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<NomEntry>) -> Void) {
        let (s, img) = loadSnapshot()
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [NomEntry(date: Date(), snapshot: s, image: img)], policy: .after(next)))
    }
}

func stateLabel(_ s: NomSnapshot) -> String {
    switch s.expression {
    case "sick": return "Under the weather"
    case "tired": return "Tired"
    case "sad": return "Feeling down"
    case "stressed": return "Stressed"
    case "sore": return "Sore"
    case "hungry": return "Hungry"
    case "stuffed", "full": return "Full & sleepy"
    case "thirsty": return "Needs water"
    case "energetic": return "Energetic"
    case "joyful": return "Thriving"
    case "happy": return "Doing well"
    default: return "Ready"
    }
}

struct NomImage: View {
    let image: UIImage?
    var body: some View {
        if let image { Image(uiImage: image).resizable().scaledToFit().accessibilityLabel("Nom") }
        else { Image(systemName: "face.smiling").resizable().scaledToFit().foregroundStyle(.secondary) }
    }
}

struct NomWidgetView: View {
    @Environment(\.widgetFamily) var family
    var entry: NomEntry
    var s: NomSnapshot { entry.snapshot }
    var calLeft: Int { max(0, s.calorie_goal - s.calories_consumed) }
    var calProgress: Double { s.calorie_goal > 0 ? min(1, Double(s.calories_consumed) / Double(s.calorie_goal)) : 0 }
    var protProgress: Double { s.protein_goal > 0 ? min(1, Double(s.protein_consumed) / Double(s.protein_goal)) : 0 }

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack { AccessoryWidgetBackground(); NomImage(image: entry.image).padding(4) }
                .widgetAccentable()
        case .accessoryRectangular:
            HStack(spacing: 8) {
                NomImage(image: entry.image).frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.nom_name).font(.headline).lineLimit(1)
                    Text("\(calLeft) cal left").font(.caption)
                    Text("\(s.protein_consumed) / \(s.protein_goal)g protein").font(.caption2).foregroundStyle(.secondary)
                }
            }
        case .accessoryInline:
            Text("\(s.nom_name): \(stateLabel(s)) · \(calLeft) cal left")
        case .systemSmall:
            VStack(spacing: 6) {
                NomImage(image: entry.image).frame(maxHeight: 84)
                Text(s.nom_name).font(.headline)
                Text(stateLabel(s)).font(.caption).foregroundStyle(.secondary)
            }.padding(8).containerBackground(for: .widget) { Color("widgetBackground") }
        default: // systemMedium: nutrition + progress
            HStack(spacing: 14) {
                VStack(spacing: 4) {
                    NomImage(image: entry.image).frame(width: 96, height: 96)
                    Text(stateLabel(s)).font(.caption2).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text(s.nom_name).font(.headline)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(calLeft) cal left").font(.title3).bold()
                        ProgressView(value: calProgress).tint(Color("accent"))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(s.protein_consumed) / \(s.protein_goal)g protein").font(.caption)
                        ProgressView(value: protProgress).tint(.blue)
                    }
                }
                Spacer(minLength: 0)
            }.padding(12).containerBackground(for: .widget) { Color("widgetBackground") }
        }
    }
}

@main
struct NomWidgetBundle: WidgetBundle {
    var body: some Widget { NomWidget() }
}

struct NomWidget: Widget {
    let kind = "NomWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NomProvider()) { entry in NomWidgetView(entry: entry) }
            .configurationDisplayName("Nom")
            .description("Your Nom, how it's feeling, and today's calories and protein.")
            .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .systemSmall, .systemMedium])
    }
}
