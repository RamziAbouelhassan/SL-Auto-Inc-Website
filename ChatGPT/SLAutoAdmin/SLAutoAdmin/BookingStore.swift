import Foundation

@MainActor
final class BookingStore: ObservableObject {
    private enum DefaultsKey {
        static let apiBaseURL = "sl_auto_admin.apiBaseURL"
    }

    @Published var bookings: [Booking] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var apiBaseURL: String {
        didSet {
            UserDefaults.standard.set(apiBaseURL, forKey: DefaultsKey.apiBaseURL)
        }
    }
    @Published var lastLoadedAt: Date?

    init() {
        apiBaseURL = UserDefaults.standard.string(forKey: DefaultsKey.apiBaseURL) ?? "http://localhost:3000"
    }

    func loadBookings() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let base = apiBaseURL
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        guard let url = URL(string: base + "/api/bookings") else {
            errorMessage = "Invalid API URL"
            return
        }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                errorMessage = "Server error loading bookings."
                return
            }

            let payload = try JSONDecoder().decode(BookingAPIResponse.self, from: data)
            bookings = payload.bookings.sorted { $0.createdAt > $1.createdAt }
            lastLoadedAt = Date()
        } catch {
            errorMessage = "Could not connect to booking API."
        }
    }
}
