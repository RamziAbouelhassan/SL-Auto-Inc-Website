import SwiftUI
import Combine

@main
@MainActor
struct SLAutoAdminApp: App {
    @StateObject private var store = BookingStore()

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                BookingListView()
            }
            .environmentObject(store)
            .background(Color(uiColor: .systemBackground).ignoresSafeArea())
        }
    }
}
