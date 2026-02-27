import SwiftUI

struct BookingListView: View {
    @EnvironmentObject private var store: BookingStore
    @State private var hasLoaded = false
    @FocusState private var apiFieldFocused: Bool

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(.systemGroupedBackground), Color(.secondarySystemGroupedBackground)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    dashboardCard
                    connectionCard

                    if let error = store.errorMessage {
                        errorBanner(error)
                    }

                    sectionLabel("Bookings")

                    if store.isLoading && store.bookings.isEmpty {
                        loadingRow
                    } else if store.bookings.isEmpty {
                        emptyStateRow
                    } else {
                        ForEach(store.bookings) { booking in
                            NavigationLink(value: booking.id) {
                                BookingRowCard(booking: booking)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 24)
            }
            .refreshable {
                await store.loadBookings()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea(edges: [.top, .bottom])
        .navigationTitle("Bookings")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: String.self) { id in
            if let booking = store.bookings.first(where: { $0.id == id }) {
                BookingDetailView(booking: booking)
            } else {
                ContentUnavailableView("Booking Not Found", systemImage: "exclamationmark.bubble")
            }
        }
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
        .toolbarBackground(Color(.systemGroupedBackground), for: .navigationBar)
        .task {
            guard !hasLoaded else { return }
            hasLoaded = true
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
                Text("\(store.bookings.count)")
                    .font(.title2.weight(.bold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.blue.opacity(0.12), in: Capsule())
                    .foregroundStyle(.blue)
            }

            HStack(spacing: 10) {
                statusPill(
                    title: store.isLoading ? "Loading" : "Connected",
                    systemImage: store.isLoading ? "arrow.triangle.2.circlepath" : "bolt.horizontal.circle.fill",
                    color: store.isLoading ? .orange : .green
                )

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
            sectionLabel("API Connection", insideCard: true)

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

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            VStack(alignment: .leading, spacing: 2) {
                Text("Load failed")
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

    private func sectionLabel(_ text: String, insideCard: Bool = false) -> some View {
        Text(text)
            .font(insideCard ? .subheadline.weight(.semibold) : .headline)
            .foregroundStyle(insideCard ? .secondary : .primary)
            .padding(.leading, insideCard ? 0 : 2)
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
}

private struct BookingRowCard: View {
    let booking: Booking

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(booking.name)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(booking.vehicleLabel)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(booking.formattedPhone)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                BookingBadge(text: booking.statusLabel, tint: booking.isUrgent ? .red : .blue)
            }

            HStack(spacing: 8) {
                BookingChip(text: booking.serviceType, systemImage: "wrench.and.screwdriver")
                if booking.isUrgent {
                    BookingChip(text: "Urgent", systemImage: "exclamationmark.triangle.fill", tint: .red)
                }
            }

            HStack {
                Label(booking.preferredDateDisplay, systemImage: "calendar")
                Spacer()
                Label(booking.timeWindow, systemImage: "clock")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            Text(booking.concernDisplay)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(14)
        .cardContainer(padding: 0)
    }
}

private struct BookingChip: View {
    let text: String
    let systemImage: String
    var tint: Color = .orange

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: systemImage)
            Text(text)
        }
        .font(.caption.weight(.medium))
        .lineLimit(1)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(tint.opacity(0.12), in: Capsule())
        .foregroundStyle(tint)
    }
}

private struct BookingBadge: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(tint.opacity(0.12), in: Capsule())
            .foregroundStyle(tint)
    }
}

extension View {
    func cardContainer(padding: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.primary.opacity(0.05), lineWidth: 1)
            )
    }
}
