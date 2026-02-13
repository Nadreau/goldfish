#!/usr/bin/env osascript -l JavaScript

// OCR using Vision framework via JXA - much faster than Swift compilation
ObjC.import('Vision');
ObjC.import('AppKit');
ObjC.import('Foundation');

function run(argv) {
    if (argv.length < 1) {
        return JSON.stringify({success: false, error: "No image path provided"});
    }
    
    const imagePath = argv[0];
    const url = $.NSURL.fileURLWithPath(imagePath);
    const image = $.NSImage.alloc.initWithContentsOfURL(url);
    
    if (!image || image.isNil()) {
        return JSON.stringify({success: false, error: "Could not load image"});
    }
    
    // Get CGImage
    const cgImage = image.CGImageForProposedRectContextHints(null, null, null);
    
    if (!cgImage) {
        return JSON.stringify({success: false, error: "Could not create CGImage"});
    }
    
    // Create text recognition request
    const request = $.VNRecognizeTextRequest.alloc.init;
    request.recognitionLevel = $.VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = true;
    
    // Create request handler and perform
    const handler = $.VNImageRequestHandler.alloc.initWithCGImageOptions(cgImage, null);
    
    var error = $();
    handler.performRequestsError([request], error);
    
    if (error.code) {
        return JSON.stringify({success: false, error: "OCR failed: " + error.localizedDescription.js});
    }
    
    const results = request.results;
    if (!results || results.count === 0) {
        return JSON.stringify({success: true, text: "", confidence: 0});
    }
    
    var allText = [];
    var totalConf = 0;
    
    for (var i = 0; i < results.count; i++) {
        const obs = results.objectAtIndex(i);
        const candidates = obs.topCandidates(1);
        if (candidates.count > 0) {
            const top = candidates.objectAtIndex(0);
            allText.push(ObjC.unwrap(top.string));
            totalConf += top.confidence;
        }
    }
    
    return JSON.stringify({
        success: true,
        text: allText.join("\n"),
        confidence: results.count > 0 ? totalConf / results.count : 0
    });
}
