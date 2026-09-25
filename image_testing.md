# Image Integration Testing Rules

## Image Handling Rules
- Always use base64-encoded images for all tests and requests.
- Accepted formats: JPEG, PNG, WEBP only.
- Do not use SVG, BMP, HEIC.
- Do not upload blank, solid-color, or uniform-variance images.
- Every image must contain real visual features (food, objects, textures).
- Transcode to PNG or JPEG if needed, and re-detect MIME after transformation.
- For animated (GIF/APNG/animated WEBP): extract first frame only.
- Resize large images to reasonable bounds.
