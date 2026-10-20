declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    HEYGEN_API_KEY?: string;
    PROVIDER_ENCRYPTION_KEY?: string;
  }
}
