/** English tooltips for inspector labels and module titles. */
const INSPECTOR_HINTS: Record<string, string> = {
    // Module titles
    Main: 'Core timing and initial particle properties when each particle is born.',
    Emission: 'How many particles spawn continuously, along movement, or in timed bursts.',
    Shape: 'The volume or surface particles spawn from (sphere, box, cone, mesh, etc.).',
    'Size over Lifetime': 'Multiplies each particle’s size over its normalized lifetime (0 = birth, 1 = death).',
    'Color over Lifetime': 'Tints color and alpha over each particle’s normalized lifetime.',
    Renderer: 'How particles are rendered: billboard mode, material, texture, depth, and sort order.',
    'Speed over Lifetime': 'Multiplies particle speed over normalized lifetime.',
    'Limit Speed over Lifetime': 'Clamps particle speed and optionally dampens velocity toward the limit.',
    'Force over Lifetime': 'Adds constant world-space acceleration (force per mass) over lifetime.',
    'Velocity over Lifetime': 'Adds linear and orbital velocity each frame in local or world space.',
    'Inherit Velocity': 'Copies the emitter’s movement into new particle velocity.',
    Gravity: 'Applies a constant downward force (Earth-like gravity by default).',
    'Rotation over Lifetime': 'Spins particles by setting angular velocity over lifetime.',
    Noise: 'Procedural noise that jitters particle position and rotation.',
    Turbulence: '3D turbulent velocity field that swirls particles through space.',
    'Randomize Direction': 'Randomizes emission direction within a cone angle around the shape normal.',
    Collision: 'Bounces particles off a ground plane in the editor preview.',
    'Color by Speed': 'Maps particle color from current speed using a gradient.',
    'Size by Speed': 'Maps particle size from current speed using a curve.',
    'Rotation by Speed': 'Maps angular velocity from current speed.',
    'Orbit over Lifetime': 'Orbits particles around a local axis over their lifetime.',
    'Width over Trail': 'Controls trail ribbon width along the particle path (trail render mode).',
    'Texture Sheet Animation': 'Animates UV tiles on the texture like a flipbook sprite sheet.',
    'Sub Emitters': 'Spawns a linked child particle system on birth, death, or every frame.',
    Object: 'Transform of the selected node. Moving the stage parent is preview-only and not exported.',

    // Main
    Duration: 'How long the particle system runs before stopping (non-looping) or one loop cycle.',
    Looping: 'When enabled, the effect restarts from the beginning after duration ends.',
    'World space': 'Simulates in world coordinates so moving the emitter does not drag existing particles.',
    Prewarm: 'Simulates the effect once at start so it already looks mid-playback when play begins.',
    'Start delay': 'Wait time before emission starts after play or restart.',
    'Start lifetime': 'How long each spawned particle lives before dying.',
    'Start speed': 'Initial speed along the emission direction when a particle is born.',
    'Start size': 'Initial size of particles — uniform scalar or separate X/Y/Z for mesh billboards.',
    'Start color': 'Initial color: solid, random between two, or gradient-based.',
    'Start rotation': 'Initial orientation: fixed angle, random, per-axis Euler, or random 3D quaternion.',
    '  X (rad)': 'Start rotation around the local X axis in radians.',
    '  Y (rad)': 'Start rotation around the local Y axis in radians.',
    '  Z (rad)': 'Start rotation around the local Z axis in radians.',

    // Emission
    'Rate over time': 'Particles spawned per second while the system is playing.',
    'Rate over distance': 'Particles spawned per unit of emitter movement.',
    Time: 'Seconds from effect start when this burst fires.',
    Count: 'Number of particles emitted in each burst cycle.',
    Cycles: 'How many times the burst repeats.',
    Interval: 'Seconds between repeated cycles of the same burst.',
    Probability: 'Chance (0–1) that the burst or sub-emitter spawn actually happens.',

    // Shape
    'shape.type': 'Emitter volume type that defines where new particles appear.',
    Radius: 'Outer radius of spherical or circular emitter shapes.',
    Arc: 'Angular span (radians) of partial circle or sphere emission.',
    Thickness: 'Shell thickness for hollow shapes (0 = surface, 1 = filled volume).',
    Angle: 'Cone opening angle for cone-shaped emitters.',
    'Donut radius': 'Inner tube radius of a torus/donut emitter.',
    Width: 'Emitter extent along the local X axis (box/grid shapes).',
    Height: 'Emitter extent along the local Y axis (box/grid shapes).',
    Columns: 'Number of grid columns for grid-shaped emission.',
    Rows: 'Number of grid rows for grid-shaped emission.',
    'Source mesh': 'Scene mesh whose surface particles spawn from (mesh surface shape).',
    'Emit mode': 'How particles are distributed across the shape: random, loop, ping-pong, or burst spread.',
    Spread: 'Randomizes spawn position within the shape (0 = exact shape, higher = more scatter).',

    // Renderer
    'Render mode': 'Orientation and geometry used to draw each particle.',
    'Trail length': 'Maximum number of trail segments per particle (trail mode).',
    'Follow origin': 'Keeps the trail anchored to the emitter origin instead of the particle head.',
    'Speed factor': 'How much particle speed stretches the billboard (stretched billboard mode).',
    'Length factor': 'Base stretch multiplier for stretched billboards.',
    Source: 'Material preset loaded from the effect JSON (read-only reference).',
    'Blend mode': 'How particle color is composited over the background.',
    Transparent: 'Enables alpha blending for soft edges and fade-outs.',
    Texture: 'Sprite or flipbook image applied to each particle.',
    'Alpha test': 'Pixels below this alpha are discarded (cutout/hard edges).',
    'Depth write': 'Writes to the depth buffer — usually off for additive particles.',
    'Depth test': 'Whether particles are occluded by scene geometry.',
    Geometry: 'Mesh vertices used when render mode is Mesh.',
    'Render order': 'Sort priority within the batch — higher draws on top.',
    'Soft particles': 'Fades particles near intersecting geometry to reduce hard cutouts.',
    'Fade near/far': 'Distance range (near, far) for soft-particle depth fading.',

    // Texture sheet
    'Tiles U': 'Number of horizontal cells in the texture atlas.',
    'Tiles V': 'Number of vertical cells in the texture atlas.',
    'Blend tiles': 'Smoothly blends between adjacent atlas tiles during animation.',
    'Start tile': 'Atlas cell index where playback begins (0 = top-left).',
    'Animate frames': 'Enables frame-over-lifetime curve to cycle through atlas tiles.',

    // Sub emitters
    Trigger: 'When the child system is spawned: on particle birth, death, or every frame.',
    'Use velocity': 'Orients the sub-emitter spawn using the parent particle’s velocity.',

    // Object transform
    Position: 'Local X/Y/Z position of the selected emitter or group node.',
    Rotation: 'Local rotation in degrees (Euler) of the selected node.',
    Scale: 'Local X/Y/Z scale of the selected node.',

    // Gradient editor
    'Stop color': 'RGB color at the selected gradient key.',
    'Stop alpha': 'Opacity at the selected gradient key (0 = transparent, 1 = opaque).',
    'Stop position': 'Normalized position of this key along the gradient (0 = start, 1 = end).',

    // Shared / behavior fields
    Dampen: 'How quickly velocity is reduced when speed exceeds the limit (0 = hard clamp, 1 = smooth).',
    Space: 'Whether velocity is applied in local emitter space or world space.',
    'Linear X': 'Added velocity along local/world X over lifetime.',
    'Linear Y': 'Added velocity along local/world Y over lifetime.',
    'Linear Z': 'Added velocity along local/world Z over lifetime.',
    'Orbital X': 'Orbital rotation speed around the X axis (radians per second).',
    'Orbital Y': 'Orbital rotation speed around the Y axis (radians per second).',
    'Orbital Z': 'Orbital rotation speed around the Z axis (radians per second).',
    Multiplier: 'Scales how much emitter velocity is copied to new particles.',
    'inheritVelocity.mode': 'Initial copies spawn-time velocity; Current uses live emitter velocity.',
    'gravity.strength': 'Magnitude of the downward force applied to every particle.',
    'noise.frequency': 'How quickly the noise pattern changes over time and space.',
    'noise.strength': 'Overall intensity of the noise displacement.',
    'Position amount': 'How strongly noise affects particle position.',
    'Rotation amount': 'How strongly noise affects particle rotation.',
    'turbulence.scale': 'Size of turbulence cells — larger values make smoother, broader swirls.',
    Octaves: 'Number of noise layers combined for finer turbulent detail.',
    'turbulence.strength': 'Per-axis multiplier for turbulent velocity.',
    'Time scale': 'How fast the turbulence field evolves over time (per axis).',
    'Angle (rad)': 'Maximum random deflection from the base emit direction, in radians.',
    Bounce: 'Energy retained after a collision (0 = stick, 1 = full bounce). Colliders are host-provided.',
    'Speed range': 'Particle speed range (min, max) that maps to the color/size/rotation curve.',
    'Orbit speed': 'Angular speed of orbit around the configured axis over lifetime.',
    'rotationOverLife.velocity': 'Angular velocity applied over normalized lifetime (rad/s).',
    'rotationBySpeed.velocity': 'Angular velocity mapped from particle speed (rad/s).',

    // Size main axes
    X: 'Start size along the local X axis.',
    Y: 'Start size along the local Y axis.',
    Z: 'Start size along the local Z axis.',

    // Force over life axes
    'force.x': 'Acceleration along world X applied over lifetime.',
    'force.y': 'Acceleration along world Y applied over lifetime.',
    'force.z': 'Acceleration along world Z applied over lifetime.',
};

/** Returns the English tooltip for an inspector label or hint key. */
export function getInspectorHint(key: string): string | undefined {
    return INSPECTOR_HINTS[key];
}
