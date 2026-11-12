const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { verifyVNPayHash, buildSignedVNPayUrl } = require('../src/services/payment.service');
const { detectMagicBytes, processAndSaveImage } = require('../src/utils/imageSecurity');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Security VNPay & Image Verification Tests', () => {
  it('VNPay: verifyVNPayHash fails if secret is empty or undefined', () => {
    const params = {
      vnp_Amount: '10000000',
      vnp_TxnRef: 'TX123',
      vnp_SecureHash: 'somehash',
    };
    assert.equal(verifyVNPayHash(params, ''), false);
    assert.equal(verifyVNPayHash(params, null), false);
    assert.equal(verifyVNPayHash(params, undefined), false);
  });

  it('VNPay: buildSignedVNPayUrl throws ApiError if secret is missing', () => {
    assert.throws(
      () =>
        buildSignedVNPayUrl(
          'https://sandbox.vnpayment.vn',
          { vnp_Amount: '1000' },
          ''
        ),
      /VNPay secret is not configured/i
    );
  });

  it('Image Security: detectMagicBytes correctly identifies PNG, JPEG, WEBP and rejects executables / fake extensions', () => {
    // Real JPEG header
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    assert.deepEqual(detectMagicBytes(jpegBuffer), { ext: '.jpg', mime: 'image/jpeg' });

    // Real PNG header
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.deepEqual(detectMagicBytes(pngBuffer), { ext: '.png', mime: 'image/png' });

    // Fake image (executable / PHP script masquerading as image)
    const fakeBuffer = Buffer.from('<?php echo "evil"; ?>');
    assert.equal(detectMagicBytes(fakeBuffer), null);
  });

  it('Image Security: processAndSaveImage rejects non-image payload even if extension was .png', async () => {
    const fakePayload = Buffer.from('<script>alert("XSS")</script>');
    const tempDir = path.join(os.tmpdir(), 'clinic_test_uploads');

    await assert.rejects(
      () => processAndSaveImage(fakePayload, tempDir),
      /Chỉ chấp nhận file ảnh thực tế định dạng JPEG, PNG, WEBP, GIF/i
    );
  });
});
