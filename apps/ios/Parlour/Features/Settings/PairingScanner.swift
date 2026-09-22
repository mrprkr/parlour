//
//  PairingScanner.swift
//  The camera, pointed at the code `parlour pair` draws on the Mac. VisionKit
//  does the finding; all this does is ask for the camera, hand over the first
//  code that is a Parlour one, and say so plainly when a code is not.
//

import AVFoundation
import SwiftUI
import VisionKit

struct PairingScanner: View {
  let onPaired: (PairingLink) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var camera: Bool?
  @State private var rejected: String?

  var body: some View {
    NavigationStack {
      ZStack {
        Palette.paper.ignoresSafeArea()
        if camera == true, DataScannerViewController.isSupported, DataScannerViewController.isAvailable {
          ScannerView { payload in
            if let link = PairingLink(string: payload) {
              onPaired(link)
              dismiss()
            } else {
              rejected = "That code is not a Parlour pairing code."
            }
          }
          .ignoresSafeArea()
          .overlay(alignment: .bottom) { caption }
        } else if camera == nil {
          ProgressView()
        } else {
          unavailable
        }
      }
      .navigationTitle("Scan pairing code")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
      }
    }
    .task { camera = await Self.cameraAccess() }
  }

  private var caption: some View {
    VStack(spacing: Space.xs) {
      Text("On the Mac, run parlour pair")
        .font(Ramp.body)
        .foregroundStyle(Palette.ink)
      if let rejected {
        Text(rejected)
          .font(Ramp.small)
          .foregroundStyle(Palette.alarm)
      }
    }
    .padding(Space.lg)
    .frame(maxWidth: .infinity)
    .background(Palette.surface.opacity(0.92), in: RoundedRectangle(cornerRadius: Radius.md))
    .padding(Space.xl)
  }

  private var unavailable: some View {
    VStack(alignment: .leading, spacing: Space.md) {
      Text(camera == false ? "The camera is off for Parlour" : "This phone cannot scan codes")
        .font(Ramp.title)
        .foregroundStyle(Palette.ink)
      Text(
        camera == false
          ? "Turn it on in Settings, Privacy and Security, Camera. Or point the Camera app at the code: it opens Parlour with the same details."
          : "Point the Camera app at the code instead: it opens Parlour with the same details. Or type the address and token by hand."
      )
      .font(Ramp.small)
      .foregroundStyle(Palette.bracken)
    }
    .padding(Space.xl)
  }

  private static func cameraAccess() async -> Bool {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: return true
    case .notDetermined: return await AVCaptureDevice.requestAccess(for: .video)
    default: return false
    }
  }
}

/// VisionKit's scanner, for QR codes only, reporting each code's text once.
private struct ScannerView: UIViewControllerRepresentable {
  let found: @MainActor (String) -> Void

  func makeUIViewController(context: Context) -> DataScannerViewController {
    let scanner = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.qr])],
      qualityLevel: .balanced,
      recognizesMultipleItems: false,
      isHighFrameRateTrackingEnabled: false,
      isHighlightingEnabled: true
    )
    scanner.delegate = context.coordinator
    return scanner
  }

  func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
    // Started here rather than in make: the scanner wants to be on screen first.
    if !scanner.isScanning { try? scanner.startScanning() }
  }

  static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
    scanner.stopScanning()
  }

  func makeCoordinator() -> Coordinator { Coordinator(found: found) }

  @MainActor
  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    let found: @MainActor (String) -> Void

    init(found: @escaping @MainActor (String) -> Void) {
      self.found = found
    }

    func dataScanner(
      _ dataScanner: DataScannerViewController,
      didAdd addedItems: [RecognizedItem],
      allItems: [RecognizedItem]
    ) {
      for item in addedItems {
        if case .barcode(let code) = item, let payload = code.payloadStringValue {
          found(payload)
          return
        }
      }
    }
  }
}
