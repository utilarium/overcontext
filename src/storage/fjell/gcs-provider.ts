import type { StorageProvider } from '../interface';
import { FjellStorageProvider } from './provider';
import { FjellGcsAdapter } from './gcs-adapter';
import type { FjellGcsProviderConfig } from './types';

export async function createFjellGcsProvider(config: FjellGcsProviderConfig): Promise<StorageProvider> {
    const adapter = new FjellGcsAdapter(config);
    const location = config.basePath
        ? `gs://${config.bucketName}/${config.basePath}`
        : `gs://${config.bucketName}`;
    const provider = new FjellStorageProvider(
        adapter,
        config.registry,
        config.name ?? 'fjell-gcs',
        location,
    );
    await provider.initialize();
    return provider;
}
