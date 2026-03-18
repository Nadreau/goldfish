#!/usr/bin/env swift
// ocr-vision.swift — Fast Vision.framework OCR for Goldfish
// Compile once: swiftc -O -o ocr-vision ocr-vision.swift
// Usage: ./ocr-vision /path/to/image.png

import Cocoa
import Vision

// Get image path from args
guard CommandLine.arguments.count > 1 else {
    fputs("Usage: ocr-vision <image-path>\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]

// Load image
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Error: Cannot load image: \(imagePath)\n", stderr)
    exit(1)
}

// Create Vision request
let request = VNRecognizeTextRequest { request, error in
    if let error = error {
        fputs("Vision error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
    
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        exit(0)
    }
    
    // Output text line by line
    for observation in observations {
        if let candidate = observation.topCandidates(1).first {
            print(candidate.string)
        }
    }
}

// Use fast mode - good enough for screen text
request.recognitionLevel = .fast
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-US"]

// Perform OCR
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("Handler error: \(error.localizedDescription)\n", stderr)
    exit(1)
}
