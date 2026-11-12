const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const ApiError = require('../utils/ApiError');

/**
 * Detect image type based on real magic bytes (not client MIME or extension)
 */
function detectMagicBytes(buffer) {
  if (!buffer || buffer.length < 8) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: '.png', mime: 'image/png' };
  }

  // GIF: 47 49 46 38 (GIF87a / GIF89a)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return { ext: '.gif', mime: 'image/gif' };
  }

  // WEBP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }

  return null;
}

/**
 * Validate image buffer using magic bytes and re-encode using sharp to strip metadata and payloads.
 * Saves processed file to destination and returns final filename.
 */
async function processAndSaveImage(fileBuffer, targetDir) {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new ApiError(400, 'File ảnh không được rỗng (0 bytes)');
  }
  if (fileBuffer.length > 5 * 1024 * 1024) {
    throw new ApiError(400, 'Kích thước file ảnh vượt quá giới hạn 5MB');
  }

  const detected = detectMagicBytes(fileBuffer);
  if (!detected) {
    throw new ApiError(400, 'Chỉ chấp nhận file ảnh thực tế định dạng JPEG, PNG, WEBP, GIF');
  }

  fs.mkdirSync(targetDir, { recursive: true });

  // Generate random UUID filename
  const filename = `${crypto.randomUUID()}${detected.ext}`;
  const targetPath = path.join(targetDir, filename);

  try {
    // Re-encode via sharp to strip EXIF / malicious payloads
    if (detected.ext === '.jpg') {
      await sharp(fileBuffer).jpeg({ quality: 85 }).toFile(targetPath);
    } else if (detected.ext === '.png') {
      await sharp(fileBuffer).png({ compressionLevel: 8 }).toFile(targetPath);
    } else if (detected.ext === '.webp') {
      await sharp(fileBuffer).webp({ quality: 85 }).toFile(targetPath);
    } else {
      // GIF: sharp handles gif metadata stripping
      await sharp(fileBuffer).gif().toFile(targetPath);
    }
  } catch (err) {
    // If sharp fails to decode, the image is malformed or corrupted
    throw new ApiError(400, `File ảnh bị lỗi hoặc không thể xử lý an toàn: ${err.message}`);
  }

  return {
    filename,
    targetPath,
    mimeType: detected.mime,
  };
}

module.exports = {
  detectMagicBytes,
  processAndSaveImage,
};

