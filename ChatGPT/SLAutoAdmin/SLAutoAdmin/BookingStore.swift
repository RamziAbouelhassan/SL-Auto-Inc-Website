import Foundation
import Combine

@MainActor
final class BookingStore: ObservableObject {
    private enum DefaultsKey {
        static let apiBaseURL = "sl_auto_admin.apiBaseURL"
    }

    @Published var bookings: [Booking] = []
    @Published var isLoading = false
    @Published private(set) var updatingBookingIDs: Set<String> = []
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

    func isUpdating(_ bookingID: String) -> Bool {
        updatingBookingIDs.contains(bookingID)
    }

    func loadBookings() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let base = normalizedBaseURL

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

    func updateBookingStatus(id: String, to status: BookingStatus) async {
        let base = normalizedBaseURL

        guard let url = URL(string: base + "/api/bookings/\(id)/status") else {
            errorMessage = "Invalid API URL"
            return
        }

        updatingBookingIDs.insert(id)
        defer { updatingBookingIDs.remove(id) }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["status": status.rawValue])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                errorMessage = "Server error updating booking."
                return
            }

            let payload = try JSONDecoder().decode(BookingMutationResponse.self, from: data)
            upsert(payload.booking)
        } catch {
            errorMessage = "Could not update booking status."
        }
    }

    func updateBookingArchive(id: String, archived: Bool) async {
        let base = normalizedBaseURL

        guard let url = URL(string: base + "/api/bookings/\(id)/archive") else {
            errorMessage = "Invalid API URL"
            return
        }

        updatingBookingIDs.insert(id)
        defer { updatingBookingIDs.remove(id) }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["archived": archived])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                errorMessage = archived ? "Server error archiving booking." : "Server error restoring booking."
                return
            }

            let payload = try JSONDecoder().decode(BookingMutationResponse.self, from: data)
            upsert(payload.booking)
        } catch {
            errorMessage = archived ? "Could not archive booking." : "Could not restore booking."
        }
    }

    func permanentlyDeleteBooking(id: String) async {
        let base = normalizedBaseURL

        guard let url = URL(string: base + "/api/bookings/\(id)") else {
            errorMessage = "Invalid API URL"
            return
        }

        updatingBookingIDs.insert(id)
        defer { updatingBookingIDs.remove(id) }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                errorMessage = "Server error deleting booking."
                return
            }

            let payload = try JSONDecoder().decode(BookingDeleteResponse.self, from: data)
            bookings.removeAll { $0.id == payload.deletedId }
            errorMessage = nil
        } catch {
            errorMessage = "Could not delete booking."
        }
    }

    private func upsert(_ booking: Booking) {
        if let index = bookings.firstIndex(where: { $0.id == booking.id }) {
            bookings[index] = booking
        } else {
            bookings.insert(booking, at: 0)
        }

        bookings.sort { $0.createdAt > $1.createdAt }
        errorMessage = nil
    }

    private var normalizedBaseURL: String {
        apiBaseURL
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
}
