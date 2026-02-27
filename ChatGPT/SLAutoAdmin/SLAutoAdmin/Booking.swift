import Foundation

struct Booking: Identifiable, Codable {
    let id: String
    let createdAt: String
    let source: String?
    let status: String?
    let name: String
    let phone: String
    let email: String?
    let contactMethod: String?
    let year: String
    let make: String
    let model: String
    let preferredDate: String
    let timeWindow: String
    let serviceType: String
    let concern: String
    let visitType: String?
    let urgency: String?

    var vehicleLabel: String {
        [year, make, model].filter { !$0.isEmpty }.joined(separator: " ")
    }

    var formattedPhone: String {
        let digits = phone.filter(\.isNumber)
        let coreDigits: String

        if digits.count == 11, digits.first == "1" {
            coreDigits = String(digits.dropFirst())
        } else {
            coreDigits = digits
        }

        guard coreDigits.count == 10 else { return phone }

        let area = coreDigits.prefix(3)
        let prefix = coreDigits.dropFirst(3).prefix(3)
        let line = coreDigits.suffix(4)
        return "(\(area)) \(prefix)-\(line)"
    }

    var createdDate: Date? {
        ISO8601DateFormatter().date(from: createdAt)
    }

    var createdAtDisplay: String {
        guard let date = createdDate else { return createdAt }
        return DateFormatter.bookingDateTime.string(from: date)
    }

    var preferredDateDisplay: String {
        guard let date = DateFormatter.bookingInputDate.date(from: preferredDate) else { return preferredDate }
        return DateFormatter.bookingDateOnly.string(from: date)
    }

    var statusLabel: String {
        if let status, !status.isEmpty { return status.capitalized }
        return "New"
    }

    var isUrgent: Bool {
        (urgency ?? "").localizedCaseInsensitiveContains("urgent") ||
        (urgency ?? "").localizedCaseInsensitiveContains("drivability")
    }

    var concernDisplay: String {
        let trimmed = concern.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "No concern provided (routine service request)." : trimmed
    }
}

struct BookingAPIResponse: Codable {
    let ok: Bool
    let bookings: [Booking]
}

private extension DateFormatter {
    static let bookingDateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()

    static let bookingDateOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        formatter.timeStyle = .none
        return formatter
    }()

    static let bookingInputDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_CA")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
