import { FilesystemProvider } from './filesystem-provider';
import { MediaServiceImpl } from './media-service';

export { FilesystemProvider } from './filesystem-provider';
export type { StorageProvider } from './storage-provider';
export { MediaServiceImpl } from './media-service';
export * from './types';

// Module-level singleton — created once at server startup
const storageProvider = new FilesystemProvider();
export const mediaService = new MediaServiceImpl(storageProvider);
