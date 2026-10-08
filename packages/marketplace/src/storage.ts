export type ObjectMetadata = {
  contentType?: string;
  height?: number;
  key: string;
  width?: number;
};
export interface ObjectStorageProvider {
  getPublicUrl(key: string): string;
  validateMetadata(metadata: ObjectMetadata): void;
}
export class DevelopmentObjectStorageProvider implements ObjectStorageProvider {
  getPublicUrl(key: string): string {
    return key;
  }
  validateMetadata(metadata: ObjectMetadata): void {
    if (
      !metadata.key.startsWith("/images/") &&
      !metadata.key.startsWith("https://")
    )
      throw new Error("Unsupported development object key");
  }
}
