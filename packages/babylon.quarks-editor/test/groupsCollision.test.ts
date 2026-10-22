import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {getPhysicsResolver, setPhysicsResolver, Vector3} from 'babylon.quarks';
import {ensureGroundResolver, GroundPlaneResolver} from '../src/core/collision';
import {groupNodes, ungroupNode} from '../src/core/groups';
import {useScene} from './helpers';

describe('grouping', () => {
    const scene = useScene();

    it('groups nodes under a new node without moving them, and ungroups back', () => {
        const parent = new TransformNode('parent', scene.get());
        parent.position.x = 10;
        const a = new TransformNode('a', scene.get());
        a.parent = parent;
        a.position.set(1, 2, 3);
        const b = new TransformNode('b', scene.get());
        b.position.set(-1, 0, 0);
        parent.computeWorldMatrix(true);
        a.computeWorldMatrix(true);
        b.computeWorldMatrix(true);

        const group = groupNodes([a, b], 'G');
        expect(group.name).toBe('G');
        expect(group.parent).toBe(parent);
        expect(a.parent).toBe(group);
        expect(b.parent).toBe(group);
        expect(a.getAbsolutePosition()).toEqual(new BVector3(11, 2, 3));
        expect(b.getAbsolutePosition()).toEqual(new BVector3(-1, 0, 0));

        ungroupNode(group);
        expect(a.parent).toBe(parent);
        expect(b.parent).toBe(parent);
        expect(group.isDisposed()).toBe(true);
        expect(a.getAbsolutePosition()).toEqual(new BVector3(11, 2, 3));
        expect(b.getAbsolutePosition()).toEqual(new BVector3(-1, 0, 0));
        expect(groupNodes([a]).name).toBe('Group');
    });
});

describe('ground collision', () => {
    afterEach(() => setPhysicsResolver(null as never));

    it('reflects at and below the plane', () => {
        const resolver = new GroundPlaneResolver(1);
        const normal = new Vector3();
        expect(resolver.resolve(new Vector3(0, 2, 0), normal)).toBe(false);
        expect(resolver.resolve(new Vector3(0, 1, 0), normal)).toBe(true);
        expect([normal.x, normal.y, normal.z]).toEqual([0, 1, 0]);
        expect(new GroundPlaneResolver().y).toBe(0);
    });

    it('registers one ground resolver and leaves a host resolver alone', () => {
        const first = ensureGroundResolver();
        expect(getPhysicsResolver()).toBe(first);
        expect(ensureGroundResolver()).toBe(first);
        const host = {resolve: () => false};
        setPhysicsResolver(host);
        expect(ensureGroundResolver()).toBe(host);
        expect(getPhysicsResolver()).toBe(host);
    });
});
