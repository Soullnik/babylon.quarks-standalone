import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {
    ParticleSystem,
    ConstantValue,
    IntervalValue,
    GridEmitter,
    RenderMode,
    ConstantColor,
    TextureSequencer,
    ApplySequences,
    RandomColor,
    Vector3,
    Vector4,
} from 'babylon.quarks';
import {SHARED_ASSETS} from '../shared/common.js';

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

function createSequencerImage(image, maxDimension) {
    const ratio = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
        return image;
    }
    context.imageSmoothingEnabled = true;
    context.drawImage(image, 0, 0, width, height);
    return canvas;
}

function centerSequencer(sequencer, image, scaleX, scaleY, anchorX, anchorY) {
    sequencer.position.x = anchorX - image.width * scaleX * 0.5;
    sequencer.position.y = anchorY - image.height * scaleY * 0.5;
}

export async function initSequencerBabylonDemo({scene, camera, batchRenderer, systems}) {
    camera.setPosition(new BVector3(0, 7, 14));
    const image = await loadImage(SHARED_ASSETS.sequenceText);
    const logo = await loadImage(SHARED_ASSETS.sequenceLogo);
    const textSequencerImage = createSequencerImage(image, 170);
    const logoSequencerImage = createSequencerImage(logo, 150);
    const texture = new Texture(SHARED_ASSETS.atlas, scene);
    const gridColumn = 100;
    const gridRow = 100;
    const particleCount = gridColumn * gridRow;

    const sequence = new ParticleSystem({
        scene,
        duration: 16,
        looping: true,
        startLife: new ConstantValue(15.8),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.035, 0.16),
        startColor: new RandomColor(new Vector4(0.97, 0.48, 0.11, 1), new Vector4(1.0, 0.71, 0.2, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(particleCount), cycle: 1, interval: 1, probability: 1}],
        shape: new GridEmitter({width: 15, height: 15, column: gridColumn, row: gridRow}),
        renderMode: RenderMode.BillBoard,
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
    });
    const seq = new TextureSequencer(0.08, 0.08, new Vector3());
    seq.fromImage(textSequencerImage, 0.5);
    centerSequencer(seq, textSequencerImage, 0.08, 0.08, -0.6, 0.75);
    const seq2 = new TextureSequencer(0.08, 0.08, new Vector3());
    seq2.fromImage(logoSequencerImage, 0.45);
    centerSequencer(seq2, logoSequencerImage, 0.08, 0.08, 0.2, -0.1);
    const applySeq = new ApplySequences(0.0001);
    applySeq.appendSequencer(new IntervalValue(0.8, 6.2), seq);
    applySeq.appendSequencer(new IntervalValue(7.8, 14.8), seq2);
    sequence.addBehavior(applySeq);
    batchRenderer.addSystem(sequence);
    systems.push(sequence);
}
