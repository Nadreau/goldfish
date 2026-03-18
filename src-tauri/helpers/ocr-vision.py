#!/usr/bin/env python3
"""Vision.framework OCR for Goldfish — fast, accurate, GPU-accelerated on Apple Silicon."""
import sys
import Vision
import Quartz
from Foundation import NSURL

if len(sys.argv) < 2:
    print("Usage: ocr-vision.py <image-path>", file=sys.stderr)
    sys.exit(1)

path = sys.argv[1]
url = NSURL.fileURLWithPath_(path)
source = Quartz.CGImageSourceCreateWithURL(url, None)
if source is None:
    print(f"Error: Cannot load image: {path}", file=sys.stderr)
    sys.exit(1)

cgImage = Quartz.CGImageSourceCreateImageAtIndex(source, 0, None)
if cgImage is None:
    print(f"Error: Cannot create CGImage from: {path}", file=sys.stderr)
    sys.exit(1)

request = Vision.VNRecognizeTextRequest.alloc().init()
request.setRecognitionLevel_(1)  # fast
request.setUsesLanguageCorrection_(False)

handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cgImage, {})
success, error = handler.performRequests_error_([request], None)

if not success:
    print(f"Vision error: {error}", file=sys.stderr)
    sys.exit(1)

for obs in request.results():
    candidates = obs.topCandidates_(1)
    if candidates:
        print(candidates[0].string())
