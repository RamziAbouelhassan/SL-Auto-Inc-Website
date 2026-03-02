import Foundation

enum BookingStatus: String, CaseIterable, Codable {
    case new
    case accepted
    case rejected

    var label: String {
        switch self {
        case .new:
            return "New"
        case .accepted:
            return "Accepted"
        case .rejected:
            return "Rejected"
        }
    }
}

struct Booking: Identifiable, Codable {
    let id: String
    let createdAt: String
    let updatedAt: String?
    let archivedAt: String?
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
        DateParser.iso8601.date(from: createdAt) ?? DateParser.iso8601NoFractionalSeconds.date(from: createdAt)
    }

    var archivedDate: Date? {
        guard let archivedAt, !archivedAt.isEmpty else { return nil }
        return DateParser.iso8601.date(from: archivedAt) ?? DateParser.iso8601NoFractionalSeconds.date(from: archivedAt)
    }

    var createdAtDisplay: String {
        guard let date = createdDate else { return createdAt }
        return DateFormatter.bookingDateTime.string(from: date)
    }

    var archivedAtDisplay: String? {
        guard let archivedDate else { return nil }
        return DateFormatter.bookingDateTime.string(from: archivedDate)
    }

    var preferredDateDisplay: String {
        guard let date = DateFormatter.bookingInputDate.date(from: preferredDate) else { return preferredDate }
        return DateFormatter.bookingDateOnly.string(from: date)
    }

    var statusLabel: String {
        resolvedStatus.label
    }

    var isUrgent: Bool {
        (urgency ?? "").localizedCaseInsensitiveContains("urgent") ||
        (urgency ?? "").localizedCaseInsensitiveContains("drivability")
    }

    var concernDisplay: String {
        let trimmed = concern.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "No concern provided (routine service request)." : trimmed
    }

    var resolvedStatus: BookingStatus {
        BookingStatus(rawValue: (status ?? "").lowercased()) ?? .new
    }

    var isPending: Bool {
        resolvedStatus == .new
    }

    var isArchived: Bool {
        archivedDate != nil
    }

    var archiveBucketLabel: String {
        resolvedStatus == .accepted ? "Completed" : "Rejected"
    }

    var daysUntilAutoDelete: Int? {
        guard let archivedDate else { return nil }
        let elapsed = Date().timeIntervalSince(archivedDate)
        let remaining = max(0, (30 * 24 * 60 * 60) - elapsed)
        return Int(ceil(remaining / (24 * 60 * 60)))
    }
}

struct BookingAPIResponse: Codable {
    let ok: Bool
    let bookings: [Booking]
}

struct BookingMutationResponse: Codable {
    let ok: Bool
    let booking: Booking
}

struct BookingDeleteResponse: Codable {
    let ok: Bool
    let deletedId: String
}

private enum DateParser {
    static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let iso8601NoFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
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
