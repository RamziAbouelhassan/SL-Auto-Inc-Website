import SwiftUI

struct BookingDetailView: View {
    @EnvironmentObject private var store: BookingStore
    let bookingID: String

    private var booking: Booking? {
        store.bookings.first(where: { $0.id == bookingID })
    }

    var body: some View {
        Group {
            if let booking {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        headerCard(for: booking)

                        detailSection("Customer") {
                            detailRow("Name", booking.name)
                            detailRow("Phone", booking.formattedPhone)
                            if let email = booking.email, !email.isEmpty {
                                detailRow("Email", email)
                            }
                            if let contact = booking.contactMethod, !contact.isEmpty {
                                detailRow("Preferred contact", contact)
                            }
                        }

                        detailSection("Vehicle & Service") {
                            detailRow("Vehicle", booking.vehicleLabel)
                            detailRow("Service", booking.serviceType)
                            if let urgency = booking.urgency, !urgency.isEmpty {
                                detailRow("Urgency", urgency)
                            }
                            if let visitType = booking.visitType, !visitType.isEmpty {
                                detailRow("Visit type", visitType)
                            }
                        }

                        detailSection("Appointment") {
                            detailRow("Preferred date", booking.preferredDateDisplay)
                            detailRow("Time window", booking.timeWindow)
                            detailRow("Created", booking.createdAtDisplay)
                            detailRow("Status", booking.statusLabel)
                            if let archivedAtDisplay = booking.archivedAtDisplay {
                                detailRow("Archived", archivedAtDisplay)
                            }
                            if let daysUntilAutoDelete = booking.daysUntilAutoDelete {
                                detailRow("Auto-delete", "In \(daysUntilAutoDelete) day\(daysUntilAutoDelete == 1 ? "" : "s")")
                            }
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
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 28)
                }
            } else {
                ContentUnavailableView("Booking Not Found", systemImage: "exclamationmark.bubble")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color(uiColor: .systemBackground))
        .navigationTitle(booking?.name ?? "Booking")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color(uiColor: .systemBackground), for: .navigationBar)
    }

    private func headerCard(for booking: Booking) -> some View {
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
                VStack(alignment: .trailing, spacing: 6) {
                    Text(booking.statusLabel)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(booking.resolvedStatus.tint.opacity(0.12), in: Capsule())
                        .foregroundStyle(booking.resolvedStatus.tint)

                    if booking.isArchived {
                        BookingBadge(text: "Archived", tint: .gray)
                    }
                }
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

            actionBar(for: booking)
        }
        .cardContainer()
    }

    @ViewBuilder
    private func actionBar(for booking: Booking) -> some View {
        if booking.isArchived {
            VStack(alignment: .leading, spacing: 10) {
                if let daysUntilAutoDelete = booking.daysUntilAutoDelete {
                    Text("This archived booking will be removed automatically in \(daysUntilAutoDelete) day\(daysUntilAutoDelete == 1 ? "" : "s").")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 10) {
                    BookingActionButton(
                        title: "Bring back",
                        systemImage: "arrow.uturn.backward.circle.fill",
                        tint: .blue,
                        isLoading: store.isUpdating(booking.id)
                    ) {
                        Task { await store.updateBookingArchive(id: booking.id, archived: false) }
                    }

                    BookingActionButton(
                        title: "Delete permanently",
                        systemImage: "trash.fill",
                        tint: .red,
                        isLoading: store.isUpdating(booking.id)
                    ) {
                        Task { await store.permanentlyDeleteBooking(id: booking.id) }
                    }
                }
                .disabled(store.isUpdating(booking.id))
            }
        } else if booking.isPending {
            HStack(spacing: 10) {
                BookingActionButton(
                    title: "Accept",
                    systemImage: "checkmark.circle.fill",
                    tint: .green,
                    isLoading: store.isUpdating(booking.id)
                ) {
                    Task { await store.updateBookingStatus(id: booking.id, to: .accepted) }
                }

                BookingActionButton(
                    title: "Reject",
                    systemImage: "xmark.circle.fill",
                    tint: .red
                ) {
                    Task { await store.updateBookingStatus(id: booking.id, to: .rejected) }
                }
            }
            .disabled(store.isUpdating(booking.id))
        } else if booking.resolvedStatus == .accepted {
            HStack(spacing: 10) {
                BookingActionButton(
                    title: "Archive",
                    systemImage: "archivebox.fill",
                    tint: .gray,
                    isLoading: store.isUpdating(booking.id)
                ) {
                    Task { await store.updateBookingArchive(id: booking.id, archived: true) }
                }

                BookingActionButton(
                    title: "Mark rejected",
                    systemImage: "xmark.circle.fill",
                    tint: .red
                ) {
                    Task { await store.updateBookingStatus(id: booking.id, to: .rejected) }
                }
            }
            .disabled(store.isUpdating(booking.id))
        } else {
            HStack(spacing: 10) {
                BookingActionButton(
                    title: "Accept",
                    systemImage: "checkmark.circle.fill",
                    tint: .green,
                    isLoading: store.isUpdating(booking.id)
                ) {
                    Task { await store.updateBookingStatus(id: booking.id, to: .accepted) }
                }

                BookingActionButton(
                    title: "Archive",
                    systemImage: "archivebox.fill",
                    tint: .gray
                ) {
                    Task { await store.updateBookingArchive(id: booking.id, archived: true) }
                }
            }
            .disabled(store.isUpdating(booking.id))
        }
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
