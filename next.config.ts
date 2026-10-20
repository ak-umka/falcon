import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // vinext считает любой multipart POST «прогрессивным server action» и режет его этим лимитом
    // ещё до route handler (по умолчанию 1 MB). Без этого /api/media не принимает фото 8 MB и MP4 25 MB,
    // а runner не может загрузить готовый ролик. 100 MB — лимит тела запроса Cloudflare Workers.
    serverActions: { bodySizeLimit: "100mb" },
  },
};

export default nextConfig;
