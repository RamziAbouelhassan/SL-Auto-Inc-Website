import SwiftUI

private enum ArchivedFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case completed = "Completed"
    case rejected = "Rejected"

    var id: String { rawValue }
}

struct RejectedBookingsView: View {
    @EnvironmentObject private var store: BookingStore

    private var rejectedBookings: [Booking] {
        store.bookings.filter { $0.resolvedStatus == .rejected && !$0.isArchived }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Rejected bookings stay out of the way here until you archive them.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("Archive anything you no longer want in the active rejected list.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .cardContainer()

                if rejectedBookings.isEmpty {
                    Text("No rejected bookings.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .cardContainer(padding: 0)
                } else {
                    ForEach(rejectedBookings) { booking in
                        VStack(alignment: .leading, spacing: 10) {
                            NavigationLink {
                                BookingDetailView(bookingID: booking.id)
                                    .environmentObject(store)
                            } label: {
                                BookingRowCard(booking: booking, subdued: true)
                            }
                            .buttonStyle(.plain)

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
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .background(Color(uiColor: .systemBackground))
        .navigationTitle("Rejected")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ArchivedBookingsView: View {
    @EnvironmentObject private var store: BookingStore
    @State private var filter: ArchivedFilter = .all

    private var archivedBookings: [Booking] {
        let archived = store.bookings.filter(\.isArchived)

        switch filter {
        case .all:
            return archived
        case .completed:
            return archived.filter { $0.resolvedStatus == .accepted }
        case .rejected:
            return archived.filter { $0.resolvedStatus == .rejected }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Archived bookings delete themselves after 30 days.")
                        .font(.subheadline.weight(.semibold))
                    Text("Use permanent delete if you want something removed right now.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .cardContainer()

                Picker("Archived filter", selection: $filter) {
                    ForEach(ArchivedFilter.allCases) { value in
                        Text(value.rawValue).tag(value)
                    }
                }
                .pickerStyle(.segmented)

                if archivedBookings.isEmpty {
                    Text("No archived bookings for this filter.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .cardContainer(padding: 0)
                } else {
                    ForEach(archivedBookings) { booking in
                        VStack(alignment: .leading, spacing: 10) {
                            NavigationLink {
                                BookingDetailView(bookingID: booking.id)
                                    .environmentObject(store)
                            } label: {
                                BookingRowCard(
                                    booking: booking,
                                    subdued: true,
                                    note: archiveNote(for: booking)
                                )
                            }
                            .buttonStyle(.plain)

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
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .background(Color(uiColor: .systemBackground))
        .navigationTitle("Archived")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func archiveNote(for booking: Booking) -> String {
        let archivedText = booking.archivedAtDisplay.map { "Archived \($0)." } ?? "Archived."
        if let daysRemaining = booking.daysUntilAutoDelete {
            return "\(archivedText) Deletes in \(daysRemaining) day\(daysRemaining == 1 ? "" : "s")."
        }
        return archivedText
    }
}
