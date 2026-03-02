import SwiftUI

struct BookingListView: View {
    @EnvironmentObject private var store: BookingStore
    @State private var hasLoaded = false
    @FocusState private var apiFieldFocused: Bool

    private var pendingBookings: [Booking] {
        store.bookings.filter { $0.isPending && !$0.isArchived }
    }

    private var acceptedBookings: [Booking] {
        store.bookings.filter { $0.resolvedStatus == .accepted && !$0.isArchived }
    }

    private var rejectedBookings: [Booking] {
        store.bookings.filter { $0.resolvedStatus == .rejected && !$0.isArchived }
    }

    private var archivedBookings: [Booking] {
        store.bookings.filter(\.isArchived)
    }

    private var activeBookingCount: Int {
        pendingBookings.count + acceptedBookings.count + rejectedBookings.count
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                dashboardCard
                connectionCard

                if let error = store.errorMessage {
                    errorBanner(error)
                }

                Text("Bookings")
                    .font(.title2.weight(.bold))
                    .padding(.top, 6)

                if store.isLoading && store.bookings.isEmpty {
                    loadingRow
                } else if store.bookings.isEmpty {
                    emptyStateRow
                } else {
                    pendingSection
                    acceptedSection
                    foldersSection
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color(uiColor: .systemBackground))
        .navigationTitle("Bookings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    apiFieldFocused = false
                    Task { await store.loadBookings() }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .disabled(store.isLoading)
            }
        }
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color(uiColor: .systemBackground), for: .navigationBar)
        .task {
            guard !hasLoaded else { return }
            hasLoaded = true
            await store.loadBookings()
        }
        .refreshable {
            await store.loadBookings()
        }
    }

    private var dashboardCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("SL Auto Admin")
                        .font(.headline)
                    Text("Booking inbox")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(activeBookingCount)")
                    .font(.title2.weight(.bold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.blue.opacity(0.12), in: Capsule())
                    .foregroundStyle(.blue)
            }

            WrappingFlowLayout(spacing: 10, rowSpacing: 10) {
                statusPill(
                    title: store.isLoading ? "Loading" : "Connected",
                    systemImage: store.isLoading ? "arrow.triangle.2.circlepath" : "bolt.horizontal.circle.fill",
                    color: store.isLoading ? .orange : .green
                )

                countPill(title: "\(pendingBookings.count) pending", color: .blue)
                countPill(title: "\(acceptedBookings.count) accepted", color: .green)
                countPill(title: "\(archivedBookings.count) archived", color: .gray)

                if store.bookings.contains(where: \.isUrgent) {
                    statusPill(title: "Urgent", systemImage: "exclamationmark.triangle.fill", color: .red)
                }
            }

            if let lastLoadedAt = store.lastLoadedAt {
                Text("Updated \(lastLoadedAt.formatted(date: .omitted, time: .shortened))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .cardContainer()
    }

    private var connectionCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("API Connection")
                .font(.headline)
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                Image(systemName: "network")
                    .foregroundStyle(.blue)
                Text("Backend URL")
                    .font(.headline)
                Spacer()
                if store.isLoading {
                    ProgressView().controlSize(.small)
                }
            }

            TextField("http://localhost:3000", text: $store.apiBaseURL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .textFieldStyle(.roundedBorder)
                .focused($apiFieldFocused)
                .submitLabel(.go)
                .onSubmit {
                    apiFieldFocused = false
                    Task { await store.loadBookings() }
                }

            Text("Use local IP for iPhone testing, e.g. http://192.168.1.10:3000")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .cardContainer()
    }

    private var pendingSection: some View {
        bookingSection(
            title: "Pending",
            subtitle: "Needs a decision",
            bookings: pendingBookings,
            emptyMessage: "No pending bookings right now.",
            tint: .blue
        ) { booking in
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
        }
    }

    private var acceptedSection: some View {
        bookingSection(
            title: "Accepted",
            subtitle: "Approved and still active",
            bookings: acceptedBookings,
            emptyMessage: "No accepted bookings yet.",
            tint: .green
        ) { booking in
            BookingActionButton(
                title: "Archive",
                systemImage: "archivebox.fill",
                tint: .gray,
                isLoading: store.isUpdating(booking.id)
            ) {
                Task { await store.updateBookingArchive(id: booking.id, archived: true) }
            }
            .disabled(store.isUpdating(booking.id))
        }
    }

    private var foldersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Folders")
                .font(.headline)

            NavigationLink {
                RejectedBookingsView()
                    .environmentObject(store)
            } label: {
                FolderEntryCard(
                    title: "Rejected",
                    subtitle: "Hidden away from the main workflow",
                    count: rejectedBookings.count,
                    tint: .gray
                )
            }
            .buttonStyle(.plain)

            NavigationLink {
                ArchivedBookingsView()
                    .environmentObject(store)
            } label: {
                FolderEntryCard(
                    title: "Archived",
                    subtitle: "Auto-deletes after 30 days",
                    count: archivedBookings.count,
                    tint: .gray
                )
            }
            .buttonStyle(.plain)
        }
        .cardContainer()
    }

    @ViewBuilder
    private func bookingSection<ActionContent: View>(
        title: String,
        subtitle: String,
        bookings: [Booking],
        emptyMessage: String,
        tint: Color,
        @ViewBuilder actionContent: @escaping (Booking) -> ActionContent
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                countPill(title: "\(bookings.count)", color: tint)
            }

            if bookings.isEmpty {
                sectionEmptyState(emptyMessage)
            } else {
                ForEach(bookings) { booking in
                    VStack(alignment: .leading, spacing: 10) {
                        NavigationLink {
                            BookingDetailView(bookingID: booking.id)
                                .environmentObject(store)
                        } label: {
                            BookingRowCard(booking: booking)
                        }
                        .buttonStyle(.plain)

                        actionContent(booking)
                    }
                }
            }
        }
        .cardContainer()
    }

    private var loadingRow: some View {
        HStack(spacing: 12) {
            ProgressView()
            Text("Loading bookings...")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .cardContainer(padding: 0)
    }

    private var emptyStateRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("No bookings yet", systemImage: "tray")
                .font(.headline)
            Text("New website bookings will appear here after customers submit the online form.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .cardContainer(padding: 0)
    }

    private func sectionEmptyState(_ message: String) -> some View {
        Text(message)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Color(uiColor: .tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            VStack(alignment: .leading, spacing: 2) {
                Text("Request failed")
                    .font(.headline)
                    .foregroundStyle(.red)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(14)
        .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.red.opacity(0.18), lineWidth: 1)
        )
    }

    private func statusPill(title: String, systemImage: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
            Text(title)
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.12), in: Capsule())
        .foregroundStyle(color)
    }

    private func countPill(title: String, color: Color) -> some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(color.opacity(0.12), in: Capsule())
            .foregroundStyle(color)
    }
}
