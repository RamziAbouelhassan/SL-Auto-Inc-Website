import SwiftUI

@main
@MainActor
struct SLAutoAdminApp: App {
    @StateObject private var store = BookingStore()

    var body: some Scene {
        WindowGroup {
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()

                NavigationStack {
                    BookingListView()
                        .environmentObject(store)
                }
            }
        }
    }
}
