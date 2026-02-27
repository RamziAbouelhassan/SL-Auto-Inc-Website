import SwiftUI

struct BookingDetailView: View {
    let booking: Booking

    var body: some View {
        ZStack {
            Color(.systemGroupedBackground).ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    headerCard

                    detailSection("Customer") {
                        detailRow("Name", booking.name)
                        detailRow("Phone", booking.formattedPhone)
                        if let email = booking.email, !email.isEmpty { detailRow("Email", email) }
                        if let contact = booking.contactMethod, !contact.isEmpty { detailRow("Preferred contact", contact) }
                    }

                    detailSection("Vehicle & Service") {
                        detailRow("Vehicle", booking.vehicleLabel)
                        detailRow("Service", booking.serviceType)
                        if let urgency = booking.urgency, !urgency.isEmpty { detailRow("Urgency", urgency) }
                        if let visitType = booking.visitType, !visitType.isEmpty { detailRow("Visit type", visitType) }
                    }

                    detailSection("Appointment") {
                        detailRow("Preferred date", booking.preferredDateDisplay)
                        detailRow("Time window", booking.timeWindow)
                        detailRow("Created", booking.createdAtDisplay)
                        detailRow("Status", booking.statusLabel)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Concern")
                            .font(.headline)
                        Text(booking.concernDisplay)
                            .font(.body)
                            .foregroundStyle(.primary)
                            .textSelection(.enabled)
                    }
                    .cardContainer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea(edges: [.top, .bottom])
        .navigationTitle(booking.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color(.systemGroupedBackground), for: .navigationBar)
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(booking.serviceType)
                        .font(.headline)
                    Text(booking.vehicleLabel)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(booking.statusLabel)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background((booking.isUrgent ? Color.red : Color.blue).opacity(0.12), in: Capsule())
                    .foregroundStyle(booking.isUrgent ? .red : .blue)
            }

            HStack(spacing: 12) {
                Label(booking.preferredDateDisplay, systemImage: "calendar")
                Label(booking.timeWindow, systemImage: "clock")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if let urgency = booking.urgency, !urgency.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: booking.isUrgent ? "exclamationmark.triangle.fill" : "info.circle")
                        .foregroundStyle(booking.isUrgent ? .red : .orange)
                    Text(urgency)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .cardContainer()
    }

    @ViewBuilder
    private func detailSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)
            VStack(alignment: .leading, spacing: 8) {
                content()
            }
        }
        .cardContainer()
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
                .foregroundStyle(.secondary)
                .frame(width: 118, alignment: .leading)
            Text(value)
                .multilineTextAlignment(.leading)
                .textSelection(.enabled)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }
}
