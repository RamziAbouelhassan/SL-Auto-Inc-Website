import SwiftUI

extension BookingStatus {
    var tint: Color {
        switch self {
        case .new:
            return .blue
        case .accepted:
            return .green
        case .rejected:
            return .gray
        }
    }
}
