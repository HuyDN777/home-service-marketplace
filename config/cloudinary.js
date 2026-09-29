require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'services_images',
        allowed_formats: ['jpg', 'jpeg', 'png']
    }
});

const upload = multer({ storage: storage });

const avatarStorage = new CloudinaryStorage({
    cloudinary,
    params: { folder: 'user_avatars', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] }
});
const avatarUpload = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, next) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        next(allowed.includes(file.mimetype) ? null : new Error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP'), allowed.includes(file.mimetype));
    }
});

module.exports = {
  cloudinary,
  upload,
  avatarUpload,
};
