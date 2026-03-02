import SwiftUI

struct WrappingFlowLayout: Layout {
    var spacing: CGFloat = 8
    var rowSpacing: CGFloat = 8

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let rows = arrangedRows(for: subviews, maxWidth: proposal.width)

        let width = rows.map(\.width).max() ?? 0
        let height = rows.reduce(CGFloat.zero) { partialResult, row in
            partialResult + row.height
        } + max(CGFloat.zero, CGFloat(rows.count - 1) * rowSpacing)

        return CGSize(width: width, height: height)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let rows = arrangedRows(for: subviews, maxWidth: bounds.width)
        var y = bounds.minY

        for row in rows {
            var x = bounds.minX
            for element in row.elements {
                subviews[element.index].place(
                    at: CGPoint(x: x, y: y),
                    proposal: ProposedViewSize(width: element.size.width, height: element.size.height)
                )
                x += element.size.width + spacing
            }
            y += row.height + rowSpacing
        }
    }

    private func arrangedRows(for subviews: Subviews, maxWidth: CGFloat?) -> [Row] {
        let measured: [RowElement] = subviews.enumerated().map { index, subview in
            RowElement(index: index, size: subview.sizeThatFits(.unspecified))
        }

        guard let maxWidth, maxWidth.isFinite, maxWidth > 0 else {
            let width = measured.reduce(CGFloat.zero) { partialResult, element in
                partialResult + element.size.width
            } + max(CGFloat.zero, CGFloat(measured.count - 1) * spacing)
            let height = measured.map(\.size.height).max() ?? 0
            return measured.isEmpty ? [] : [Row(elements: measured, width: width, height: height)]
        }

        var rows: [Row] = []
        var currentElements: [RowElement] = []
        var currentWidth: CGFloat = 0
        var currentHeight: CGFloat = 0

        for element in measured {
            let proposedWidth = currentElements.isEmpty
                ? element.size.width
                : currentWidth + spacing + element.size.width

            if !currentElements.isEmpty && proposedWidth > maxWidth {
                rows.append(Row(elements: currentElements, width: currentWidth, height: currentHeight))
                currentElements = [element]
                currentWidth = element.size.width
                currentHeight = element.size.height
            } else {
                currentElements.append(element)
                currentWidth = proposedWidth
                currentHeight = max(currentHeight, element.size.height)
            }
        }

        if !currentElements.isEmpty {
            rows.append(Row(elements: currentElements, width: currentWidth, height: currentHeight))
        }

        return rows
    }

    private struct Row {
        let elements: [RowElement]
        let width: CGFloat
        let height: CGFloat
    }

    private struct RowElement {
        let index: Int
        let size: CGSize
    }
}

struct BookingRowCard: View {
    let booking: Booking
    var subdued = false
    var note: String? = nil

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
                VStack(alignment: .trailing, spacing: 6) {
                    BookingBadge(text: booking.statusLabel, tint: booking.resolvedStatus.tint)
                    if booking.isArchived {
                        BookingBadge(text: "Archived", tint: .gray)
                    }
                }
            }

            WrappingFlowLayout(spacing: 8, rowSpacing: 8) {
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

            if let note, !note.isEmpty {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text(booking.concernDisplay)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .opacity(subdued ? 0.72 : 1)
        .padding(14)
        .background(
            Color(uiColor: subdued ? .tertiarySystemBackground : .secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.primary.opacity(subdued ? 0.04 : 0.06), lineWidth: 1)
        )
    }
}

struct BookingChip: View {
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
        .fixedSize(horizontal: true, vertical: true)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(tint.opacity(0.12), in: Capsule())
        .foregroundStyle(tint)
    }
}

struct BookingBadge: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .fixedSize(horizontal: true, vertical: true)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(tint.opacity(0.12), in: Capsule())
            .foregroundStyle(tint)
    }
}

struct BookingActionButton: View {
    let title: String
    let systemImage: String
    let tint: Color
    var isSelected = false
    var isLoading = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(tint)
                } else {
                    Image(systemName: systemImage)
                }
                Text(title)
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(
                tint.opacity(isSelected ? 0.2 : 0.12),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .foregroundStyle(tint)
    }
}

struct FolderEntryCard: View {
    let title: String
    let subtitle: String
    let count: Int
    let tint: Color

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(tint.opacity(0.12))
                    .frame(width: 42, height: 42)
                Image(systemName: "folder.fill")
                    .foregroundStyle(tint)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text("\(count)")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(tint.opacity(0.12), in: Capsule())
                .foregroundStyle(tint)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(14)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.primary.opacity(0.05), lineWidth: 1)
        )
    }
}

extension View {
    func cardContainer(padding: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.primary.opacity(0.05), lineWidth: 1)
            )
    }
}
