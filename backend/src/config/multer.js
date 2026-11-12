const multer = require('multer');
const ApiError = require('../utils/ApiError');

function createImageUploader() {
  const storage = multer.memoryStorage();

  const fileFilter = (_req, file, cb) => {
    // Basic filter in multer; full magic bytes check will run in imageService
    if (!file) {
      return cb(new ApiError(400, 'Vui lòng chọn file ảnh để tải lên'));
    }
    cb(null, true);
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
      files: 1, // 1 file per upload
    },
  });
}

module.exports = { createImageUploader };

