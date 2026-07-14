import type {BatchedRenderer} from 'babylon.quarks';

const STORAGE_KEY = 'quarksDebugRender';

/** Whether GPU/particle mismatch logging is enabled (localStorage quarksDebugRender=1). */
export function isRenderDebugEnabled(): boolean {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

let lastMismatchKey = '';

/**
 * Logs when live particle count is zero but a batch still reports GPU instances.
 * Enable with: localStorage.setItem('quarksDebugRender', '1')
 */
export function logRenderMismatch(renderer: BatchedRenderer, liveParticleCount: number): void {
    if (!isRenderDebugEnabled()) {
        return;
    }
    const stats = renderer.getBatchRenderStats();
    const instanceCount = stats.reduce((sum, row) => sum + row.instanceCount, 0);
    const batchParticleCount = stats.reduce((sum, row) => sum + row.particleCount, 0);
    if (liveParticleCount !== 0 && instanceCount === liveParticleCount) {
        lastMismatchKey = '';
        return;
    }
    if (liveParticleCount === 0 && instanceCount === 0 && batchParticleCount === 0) {
        lastMismatchKey = '';
        return;
    }
    const key = `${liveParticleCount}|${instanceCount}|${batchParticleCount}|${stats.map((row) => `${row.batchIndex}:${row.instanceCount}/${row.particleCount}`).join(';')}`;
    if (key === lastMismatchKey) {
        return;
    }
    lastMismatchKey = key;
    console.warn('[quarks render debug] particle vs GPU instance mismatch', {
        liveParticleCount,
        batchParticleCount,
        instanceCount,
        batches: stats,
    });
}
