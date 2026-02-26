import type { StorageProvider } from '../interface';
import { FjellStorageProvider } from './provider';
import { FjellFsAdapter } from './fs-adapter';
import type { FjellFsProviderConfig } from './types';

export async function createFjellFsProvider(config: FjellFsProviderConfig): Promise<StorageProvider> {
    const adapter = new FjellFsAdapter(config);
    const provider = new FjellStorageProvider(
        adapter,
        config.registry,
        config.name ?? 'fjell-fs',
        config.basePath,
    );
    await provider.initialize();
    return provider;
}
