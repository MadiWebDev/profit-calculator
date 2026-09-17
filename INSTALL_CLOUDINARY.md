# Cloudinary Setup Required

Please run the following command to install Cloudinary:

```bash
npm install cloudinary
```

Then add these environment variables to your `.env.local`:

```env
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_upload_preset
```

To get these values:
1. Sign up at https://cloudinary.com
2. Go to Dashboard to find your Cloud Name, API Key, and API Secret
3. Create an upload preset in Settings > Upload (use unsigned preset for client uploads)
