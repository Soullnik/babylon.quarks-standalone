import React from 'react';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Quaternion} from '@babylonjs/core/Maths/math.vector';
import {ModuleSection} from './ModuleSection';
import {NumberField, Row} from './fields';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

function getEulerDegrees(node: TransformNode): {x: number; y: number; z: number} {
    const euler = node.rotationQuaternion ? node.rotationQuaternion.toEulerAngles() : node.rotation;
    return {x: euler.x * RAD_TO_DEG, y: euler.y * RAD_TO_DEG, z: euler.z * RAD_TO_DEG};
}

function setEulerDegreeAxis(node: TransformNode, axis: 'x' | 'y' | 'z', degrees: number): void {
    const euler = node.rotationQuaternion ? node.rotationQuaternion.toEulerAngles() : node.rotation.clone();
    euler[axis] = degrees * DEG_TO_RAD;
    if (node.rotationQuaternion) {
        node.rotationQuaternion = Quaternion.FromEulerVector(euler);
    } else {
        node.rotation = euler;
    }
}

function AxisRow(props: {label: string; hintKey?: string; values: {x: number; y: number; z: number}; step: number; onChange: (axis: 'x' | 'y' | 'z', value: number) => void}) {
    return (
        <Row label={props.label} hintKey={props.hintKey}>
            <div style={{display: 'flex', gap: 4}}>
                <NumberField value={props.values.x} step={props.step} onChange={(v) => props.onChange('x', v)} />
                <NumberField value={props.values.y} step={props.step} onChange={(v) => props.onChange('y', v)} />
                <NumberField value={props.values.z} step={props.step} onChange={(v) => props.onChange('z', v)} />
            </div>
        </Row>
    );
}

export function ObjectModule(props: {node: TransformNode; label: string}) {
    const {node} = props;
    const euler = getEulerDegrees(node);
    return (
        <ModuleSection title={`Object — ${props.label}`}>
            <AxisRow label="Position" values={{x: node.position.x, y: node.position.y, z: node.position.z}} step={0.1} onChange={(axis, v) => (node.position[axis] = v)} />
            <AxisRow label="Rotation" values={euler} step={1} onChange={(axis, v) => setEulerDegreeAxis(node, axis, v)} />
            <AxisRow label="Scale" values={{x: node.scaling.x, y: node.scaling.y, z: node.scaling.z}} step={0.1} onChange={(axis, v) => (node.scaling[axis] = v)} />
        </ModuleSection>
    );
}
