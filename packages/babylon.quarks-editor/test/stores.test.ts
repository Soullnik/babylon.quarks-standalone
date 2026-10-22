import {getAssetDragSession, setAssetDragSession} from '../src/core/assetDragSession';
import {getTransformRevision, notifyTransformChanged, subscribeTransform} from '../src/core/transformStore';

describe('transform store', () => {
    it('counts changes and notifies subscribers until they unsubscribe', () => {
        const before = getTransformRevision();
        const seen: number[] = [];
        const unsubscribe = subscribeTransform(() => seen.push(getTransformRevision()));
        notifyTransformChanged();
        unsubscribe();
        notifyTransformChanged();
        expect(seen).toEqual([before + 1]);
        expect(getTransformRevision()).toBe(before + 2);
    });
});

describe('asset drag session', () => {
    it('holds the payload of the drag in flight', () => {
        expect(getAssetDragSession()).toBeNull();
        setAssetDragSession({kind: 'asset', id: 3});
        expect(getAssetDragSession()).toEqual({kind: 'asset', id: 3});
        setAssetDragSession(null);
        expect(getAssetDragSession()).toBeNull();
    });
});
