// Procedural PBR materials (TSL). Everything is authored in world space so the
// large architectural surfaces never show texture repetition, and every
// high-frequency pattern fades to its mean colour with distance to stay stable.

import * as THREE from 'three/webgpu';
import {
	Fn, attribute, float, vec2, vec3, vec4, color, uniform, mix, smoothstep, step, clamp, abs, max, min, pow, dot, fract, floor, sin, cos, length, exp,
	positionWorld, normalWorld, normalView, cameraPosition, fwidth, mx_noise_float, mx_fractal_noise_float, mx_worley_noise_float, mx_cell_noise_float,
	uv, texture, time, positionLocal, If, select, atan
} from 'three/tsl';
import { bumpNormal, dominantPlanar, runningBond, rainStreaks } from '../core/tsl-utils.js';

const lin = ( hex ) => new THREE.Color( hex ); // THREE.Color converts sRGB hex to linear working space

/** 0 near the camera → 1 where a pattern of the given world size becomes sub-pixel. */
const patternFade = ( p, size ) => smoothstep( 0.35, 1.0, length( fwidth( p ) ).div( size ) );

/** Shared distance-to-camera for detail LOD. */
const camDist = () => length( positionWorld.sub( cameraPosition ) );

// ----------------------------------------------------------------- gold

/**
 * Gilded bronze. With `baked`, reads the per-vertex cavity AO / curvature / region
 * mask written by the SDF sculpting pipeline (`_bake` attribute).
 */
export function gildedBronze( { baked = true, aged = 1, polish = 0 } = {} ) {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const bake = baked ? attribute( '_bake', 'vec4' ) : vec4( 1, 0.5, 0, 1 );
	const ao = bake.x;
	const curv = bake.y;
	const region = bake.z;
	const cavity = ao.oneMinus();

	const nLow = mx_noise_float( p.mul( 0.9 ) );
	const nMid = mx_noise_float( p.mul( 4.3 ) );
	// dust and tarnish settle into the folds; rain rinses convex areas
	const dirt = smoothstep( 0.18, 0.7, cavity.mul( 1.25 ).add( nLow.mul( 0.12 ) ).add( nMid.mul( 0.05 ) ) ).mul( aged );
	const streak = rainStreaks( p, normalWorld, 2.2 ).mul( 0.6 ).mul( aged );
	// individual gold-leaf sheets (~9 cm) catch light slightly differently
	const leafCell = mx_cell_noise_float( floor( p.mul( 11 ) ) );
	const leafFade = patternFade( p, 0.09 );
	const leaf = mix( leafCell.sub( 0.5 ), float( 0 ), leafFade );

	const gold = vec3( 1.0, 0.72, 0.3 );
	const goldVar = gold.mul( leaf.mul( 0.07 ).add( 1 ) ).mul( nMid.mul( 0.03 ).add( 1 ) );
	const tarnish = vec3( 0.16, 0.1, 0.045 );
	const grime = vec3( 0.05, 0.045, 0.035 );
	let col = mix( goldVar, tarnish, dirt.mul( 0.7 ) );
	col = mix( col, grime, streak.mul( 0.35 ) );

	const edge = smoothstep( 0.52, 0.7, curv ); // burnished high points
	let rough = float( 0.2 ).add( dirt.mul( 0.34 ) ).add( streak.mul( 0.12 ) ).add( leaf.abs().mul( 0.06 ) ).sub( edge.mul( 0.08 ) );
	rough = mix( rough, rough.mul( 0.65 ), region.mul( 1.0 ).add( polish ).clamp() );

	m.colorNode = col;
	m.roughnessNode = rough.clamp( 0.08, 0.8 );
	m.metalnessNode = float( 1 ).sub( dirt.mul( 0.35 ) ).sub( streak.mul( 0.2 ) );
	m.aoNode = mix( float( 1 ), ao, 0.65 );
	// micro hammered surface of repoussé gilding
	const micro = mx_noise_float( p.mul( 38 ) ).mul( 0.0006 ).mul( patternFade( p, 0.03 ).oneMinus() );
	m.normalNode = bumpNormal( micro );
	return m;

}

/** Gold-leaf mosaic for the iwan niche and inlays: tessellated tiles with slight tilt. */
export function goldMosaic( { tile = 0.05, baked = false } = {} ) {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const pl = dominantPlanar( p, normalWorld );
	const g = pl.xy.div( tile );
	const cell = floor( g );
	const f = fract( g );
	const id = mx_cell_noise_float( cell.add( pl.z.mul( 17 ) ) );
	const grout = smoothstep( 0.0, 0.08, min( min( f.x, f.x.oneMinus() ), min( f.y, f.y.oneMinus() ) ) );
	const fade = patternFade( p, tile );
	const ao = baked ? attribute( '_bake', 'vec4' ).x : float( 1 );

	const gold = vec3( 1.0, 0.7, 0.28 );
	const tint = mix( id.mul( 0.16 ).add( 0.9 ), float( 0.98 ), fade );
	const groutCol = vec3( 0.25, 0.18, 0.08 );
	m.colorNode = mix( mix( groutCol, gold.mul( tint ), mix( grout, float( 0.93 ), fade ) ), vec3( 0.1, 0.07, 0.03 ), ao.oneMinus().mul( 0.6 ) );
	m.metalnessNode = mix( mix( float( 0.2 ), float( 1 ), grout ), float( 0.95 ), fade );
	m.roughnessNode = mix( id.mul( 0.2 ).add( 0.16 ), float( 0.28 ), fade ).add( ao.oneMinus().mul( 0.25 ) );
	// each tessera is set at a slightly different angle, making the surface glitter
	const tilt = vec2( mx_cell_noise_float( cell.add( 3.1 ) ), mx_cell_noise_float( cell.add( 7.7 ) ) ).sub( 0.5 ).mul( 0.18 ).mul( fade.oneMinus() );
	const h = tilt.x.mul( f.x ).add( tilt.y.mul( f.y ) ).mul( tile ).add( grout.mul( tile * 0.06 ).mul( fade.oneMinus() ) );
	m.normalNode = bumpNormal( h );
	m.aoNode = ao;
	return m;

}

// ---------------------------------------------------------------- stone

/**
 * Honed travertine / limestone cladding in large running-bond panels.
 * `pattern` adds the portal's gilded geometric inlay (see `portalPattern`).
 */
export function travertine( { panel = [ 1.6, 0.8 ], tint = 0xd9ccb4, pattern = null, dirtBase = 0 } = {} ) {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const n = normalWorld;
	const pl = dominantPlanar( p, n );
	const grid = runningBond( pl.xy, vec2( panel[ 0 ], panel[ 1 ] ), float( 0.008 ) );
	const edge = grid.x, id = grid.y, joint = grid.z;

	const base = color( tint );
	const layers = mx_fractal_noise_float( vec3( p.x.mul( 0.35 ), p.y.mul( 3.2 ), p.z.mul( 0.35 ) ), 3, 2.0, 0.5 );
	const blotch = mx_noise_float( p.mul( 0.8 ) );
	const pores = smoothstep( 0.14, 0.05, mx_worley_noise_float( vec3( p.x.mul( 14 ), p.y.mul( 34 ), p.z.mul( 14 ) ) ) );
	const poreFade = patternFade( p, 0.03 ).oneMinus();

	let col = base.mul( id.sub( 0.5 ).mul( 0.1 ).add( 1 ) ).mul( layers.mul( 0.07 ).add( 1 ) ).mul( blotch.mul( 0.04 ).add( 1 ) );
	col = mix( col, col.mul( 0.55 ), pores.mul( poreFade ).mul( 0.6 ) );

	// weathering: splash-back at the foot, rain streaks, darker joints
	const foot = smoothstep( 3.5 + dirtBase, dirtBase, p.y ).mul( 0.35 );
	const streak = rainStreaks( p, n, 1.3 );
	col = mix( col, col.mul( vec3( 0.62, 0.6, 0.58 ) ), foot.add( streak.mul( 0.35 ) ).clamp() );
	col = mix( col.mul( 0.72 ), col, joint );

	let rough = float( 0.62 ).add( id.mul( 0.08 ) ).add( streak.mul( 0.08 ) ).sub( foot.mul( 0.05 ) );
	let metal = float( 0 );
	let height = joint.mul( 0.003 ).add( smoothstep( 0.0, 0.02, edge ).mul( 0.001 ) ).sub( pores.mul( poreFade ).mul( 0.0015 ) );

	if ( pattern ) {

		const pat = pattern( p, n );
		const gold = vec3( 1.0, 0.7, 0.28 ).mul( mx_noise_float( p.mul( 6 ) ).mul( 0.06 ).add( 0.94 ) );
		col = mix( col, gold, pat.x );
		rough = mix( rough, float( 0.26 ), pat.x );
		metal = pat.x;
		height = height.add( pat.y.mul( 0.012 ) );

	}

	m.colorNode = col;
	m.roughnessNode = rough;
	m.metalnessNode = metal;
	m.normalNode = bumpNormal( height );
	return m;

}

/** Polished red granite (plinths): feldspar, mica and quartz grains under a gloss. */
export function redGranite( { tint = 1, weather = 1 } = {} ) {

	const m = new THREE.MeshPhysicalNodeMaterial();
	const p = positionWorld;
	const warp = vec3( mx_noise_float( p.mul( 9 ) ), mx_noise_float( p.mul( 9 ).add( 13.1 ) ), mx_noise_float( p.mul( 9 ).add( 7.3 ) ) ).mul( 0.012 );
	const q = p.add( warp );
	const grainCell = mx_cell_noise_float( floor( q.mul( 110 ) ) );
	const grain2 = mx_cell_noise_float( floor( q.mul( 45 ) ).add( 5.0 ) );
	const fade = patternFade( p, 0.012 );

	const feldspar = vec3( 0.31, 0.065, 0.045 ).mul( tint );
	const deep = vec3( 0.16, 0.035, 0.025 );
	const mica = vec3( 0.018, 0.015, 0.014 );
	const quartz = vec3( 0.3, 0.26, 0.24 );
	let g = mix( feldspar, deep, step( 0.55, grain2 ) );
	g = mix( g, mica, step( 0.84, grainCell ) );
	g = mix( g, quartz, step( 0.95, grainCell ) );
	const mean = vec3( 0.22, 0.052, 0.038 ).mul( tint );
	const cloud = mx_noise_float( p.mul( 0.7 ) ).mul( 0.12 ).add( 1 );
	let col = mix( g, mean, fade ).mul( cloud );

	// weathering towards the base and on top faces
	const low = smoothstep( 2.6, 1.2, p.y ).mul( weather );
	const top = smoothstep( 0.7, 0.95, normalWorld.y ).mul( weather );
	const water = rainStreaks( p, normalWorld, 2.0 ).mul( weather );
	col = mix( col, col.mul( vec3( 0.75, 0.78, 0.8 ) ).add( 0.01 ), low.mul( 0.4 ).add( water.mul( 0.25 ) ) );

	m.colorNode = col;
	m.metalnessNode = float( 0 );
	m.roughnessNode = float( 0.13 ).add( low.mul( 0.22 ) ).add( top.mul( 0.18 ) ).add( water.mul( 0.12 ) ).add( mx_noise_float( p.mul( 3 ) ).mul( 0.03 ) );
	m.specularIntensityNode = float( 1 );
	m.ior = 1.55;
	return m;

}

/** Flamed grey granite for the podium, steps, kerbs and pool rim. */
export function greyGranite( { tint = 0x8a8784, slab = [ 1.2, 0.6 ], rough = 0.72 } = {} ) {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const pl = dominantPlanar( p, normalWorld );
	const grid = runningBond( pl.xy, vec2( slab[ 0 ], slab[ 1 ] ), float( 0.006 ) );
	const speck = mx_cell_noise_float( floor( p.mul( 140 ) ) );
	const fade = patternFade( p, 0.008 );
	const base = color( tint );
	const s = mix( speck.sub( 0.5 ).mul( 0.5 ), float( 0 ), fade );
	let col = base.mul( s.add( 1 ) ).mul( grid.y.sub( 0.5 ).mul( 0.12 ).add( 1 ) ).mul( mx_noise_float( p.mul( 0.5 ) ).mul( 0.08 ).add( 1 ) );
	col = mix( col.mul( 0.65 ), col, grid.z );
	const dirt = smoothstep( 0.5, 0.0, p.y ).mul( 0.2 ).add( rainStreaks( p, normalWorld, 1.5 ).mul( 0.2 ) );
	col = col.mul( dirt.oneMinus() );
	m.colorNode = col;
	m.roughnessNode = float( rough ).add( speck.mul( 0.1 ).mul( fade.oneMinus() ) );
	m.metalnessNode = float( 0 );
	m.normalNode = bumpNormal( grid.z.mul( 0.004 ).add( mx_noise_float( p.mul( 60 ) ).mul( 0.0004 ).mul( fade.oneMinus() ) ) );
	return m;

}

// ------------------------------------------------------------- ground

/**
 * Plaza paving: pale granite slabs with a pinkish border pattern, wear along
 * the walking lines and wet patches near the fountain.
 * `wetNode(p)` returns 0..1 wetness from the scene layout.
 */
export function paving( { wetNode = null } = {} ) {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const uvw = p.xz;
	const grid = runningBond( uvw, vec2( 0.9, 0.45 ), float( 0.007 ) );
	const id = grid.y, joint = grid.z;

	// decorative bands of darker red granite every 9 m and along the axis
	const band = step( abs( fract( p.z.div( 9 ) ).sub( 0.5 ) ), 0.05 ).max( step( abs( p.x ), 1.0 ).mul( step( 20, p.z ) ) );
	const light = color( 0xb3aea6 );
	const warm = color( 0xb9a898 );
	const pink = color( 0x9c7f76 );
	const red = color( 0x6e4038 );
	let col = mix( light, warm, step( 0.55, id ) );
	col = mix( col, pink, step( 0.88, id ) );
	col = mix( col, red, band );
	col = col.mul( id.sub( 0.5 ).mul( 0.12 ).add( 1 ) );
	const fine = mx_cell_noise_float( floor( p.mul( 120 ) ) );
	const fade = patternFade( p, 0.01 );
	col = col.mul( mix( fine.sub( 0.5 ).mul( 0.28 ), float( 0 ), fade ).add( 1 ) );

	// wear, stains, chewing-gum dots
	const wearPath = smoothstep( 6, 0, abs( p.x ) ).mul( 0.5 ).add( smoothstep( 3, 0, abs( abs( p.x ).sub( 12 ) ) ).mul( 0.5 ) );
	const stains = smoothstep( 0.25, 0.7, mx_fractal_noise_float( vec3( uvw.mul( 0.35 ), 1.0 ), 3, 2, 0.5 ) );
	const gum = smoothstep( 0.035, 0.01, mx_worley_noise_float( vec3( uvw.mul( 1.3 ), 2.0 ) ) ).mul( 0.5 );
	col = col.mul( stains.mul( 0.18 ).oneMinus() ).mul( wearPath.mul( 0.08 ).oneMinus() );
	col = mix( col, col.mul( 0.45 ), gum.mul( fade.oneMinus() ) );
	col = mix( col.mul( 0.55 ), col, joint );

	let rough = float( 0.66 ).sub( wearPath.mul( 0.14 ) ).add( id.mul( 0.08 ) );
	if ( wetNode ) {

		const wet = wetNode( p );
		const puddle = smoothstep( 0.45, 0.6, mx_fractal_noise_float( vec3( uvw.mul( 0.5 ), 3.0 ), 3, 2, 0.5 ).add( wet.mul( 0.6 ) ) ).mul( wet );
		col = mix( col, col.mul( 0.55 ), wet.mul( 0.7 ) );
		rough = mix( rough, float( 0.28 ), wet.mul( 0.8 ) );
		rough = mix( rough, float( 0.04 ), puddle );
		col = mix( col, col.mul( 0.4 ), puddle.mul( 0.5 ) );

	}

	m.colorNode = col;
	m.roughnessNode = rough;
	m.metalnessNode = float( 0 );
	m.normalNode = bumpNormal( joint.mul( 0.004 ).add( fine.mul( 0.0004 ).mul( fade.oneMinus() ) ) );
	return m;

}

/** Asphalt with aggregate, patching, tyre polish and painted lane markings. */
export function asphalt( { markings = null } = {} ) {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const agg = mx_cell_noise_float( floor( p.mul( 90 ) ) );
	const fade = patternFade( p, 0.012 );
	const patch = smoothstep( 0.35, 0.4, mx_noise_float( vec3( p.xz.mul( 0.08 ), 4.0 ) ) );
	let col = vec3( 0.045, 0.045, 0.048 ).mul( mix( agg.mul( 0.8 ).add( 0.6 ), float( 1 ), fade ) );
	col = mix( col, vec3( 0.03, 0.03, 0.032 ), patch.mul( 0.6 ) );
	const cracks = smoothstep( 0.02, 0.0, mx_worley_noise_float( vec3( p.xz.mul( 0.45 ), 0.0 ) ).sub( 0.02 ).abs() );
	col = mix( col, vec3( 0.02 ), cracks.mul( 0.5 ) );
	let rough = float( 0.86 );
	if ( markings ) {

		const paint = markings( p );
		col = mix( col, vec3( 0.62, 0.62, 0.6 ), paint.mul( mx_noise_float( p.mul( 3 ) ).mul( 0.15 ).add( 0.85 ) ) );
		rough = mix( rough, float( 0.6 ), paint );

	}

	m.colorNode = col;
	m.roughnessNode = rough;
	m.metalnessNode = float( 0 );
	return m;

}

/** Mown lawn seen from a distance (blades are added near the camera separately). */
export function lawn() {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const patches = mx_fractal_noise_float( vec3( p.xz.mul( 0.06 ), 0.0 ), 4, 2, 0.5 );
	const fine = mx_noise_float( vec3( p.xz.mul( 3.0 ), 1.0 ) );
	const stripes = step( 0.5, fract( p.x.div( 3.6 ) ) ).mul( 2 ).sub( 1 ); // mowing stripes
	const g1 = color( 0x4a6a24 ), g2 = color( 0x6b7d2e ), dry = color( 0x8b8446 );
	let col = mix( g1, g2, patches.mul( 0.5 ).add( 0.5 ) );
	col = mix( col, dry, smoothstep( 0.35, 0.75, patches ).mul( 0.45 ) );
	col = col.mul( stripes.mul( 0.07 ).add( 1 ) ).mul( fine.mul( 0.08 ).add( 1 ) );
	m.colorNode = col;
	m.roughnessNode = float( 0.95 );
	m.metalnessNode = float( 0 );
	m.normalNode = bumpNormal( mx_noise_float( vec3( p.xz.mul( 12 ), 3.0 ) ).mul( 0.004 ).mul( patternFade( p, 0.05 ).oneMinus() ) );
	return m;

}

/** Dark garden soil for the flower beds. */
export function soil() {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const n = mx_fractal_noise_float( p.mul( 4 ), 3, 2, 0.5 );
	m.colorNode = vec3( 0.07, 0.05, 0.035 ).mul( n.mul( 0.25 ).add( 1 ) );
	m.roughnessNode = float( 0.95 );
	m.normalNode = bumpNormal( mx_noise_float( p.mul( 25 ) ).mul( 0.004 ) );
	return m;

}

// ------------------------------------------------------------ foliage

/** Bark with vertical fissures (planes get their characteristic peeling patches). */
export function bark( { tint = 0x6b5a48, plane = false } = {} ) {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionLocal;
	const a = atan( p.x, p.z );
	const fiss = mx_noise_float( vec3( a.mul( 3 ), p.y.mul( 1.4 ), 0.0 ) );
	const ridges = smoothstep( - 0.2, 0.4, fiss );
	let col = color( tint ).mul( ridges.mul( 0.4 ).add( 0.7 ) );
	if ( plane ) {

		const peel = smoothstep( 0.1, 0.3, mx_noise_float( positionWorld.mul( vec3( 1.6, 0.9, 1.6 ) ) ) );
		col = mix( col, color( 0xb8b08f ), peel.mul( 0.7 ) );

	}

	m.colorNode = col;
	m.roughnessNode = float( 0.92 );
	m.normalNode = bumpNormal( ridges.mul( 0.01 ) );
	return m;

}

/**
 * Leaf cards from the foliage atlas with light transmission. `windNode` supplies
 * the vertex displacement so leaves and branches sway together.
 */
export function foliageMaterial( atlas, { cell = [ 0, 0 ], tint = 1, windNode = null } = {} ) {

	const m = new THREE.MeshSSSNodeMaterial();
	const off = vec2( cell[ 0 ] * 0.5, cell[ 1 ] * 0.5 );
	const tex = texture( atlas, uv().mul( 0.5 ).add( off ) );
	const inst = attribute( 'leafTint', 'float' );
	const hue = mix( vec3( 1.08, 1.02, 0.8 ), vec3( 0.88, 0.97, 1.02 ), inst );
	m.colorNode = tex.rgb.mul( hue ).mul( tint );
	m.opacityNode = tex.a;
	m.alphaTest = 0.45;
	m.side = THREE.DoubleSide;
	m.roughnessNode = float( 0.7 );
	m.metalnessNode = float( 0 );
	m.thicknessColorNode = tex.rgb.mul( vec3( 1.2, 1.35, 0.6 ) );
	m.thicknessDistortionNode = float( 0.25 );
	m.thicknessAmbientNode = float( 0.0 );
	m.thicknessAttenuationNode = float( 0.3 );
	m.thicknessPowerNode = float( 3.0 );
	m.thicknessScaleNode = float( 1.4 );
	if ( windNode ) m.positionNode = windNode;
	return m;

}

// --------------------------------------------------------------- misc

export function paintedMetal( hex = 0x1d1f1e, rough = 0.45 ) {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	m.colorNode = color( hex ).mul( mx_noise_float( p.mul( 2 ) ).mul( 0.08 ).add( 1 ) );
	m.roughnessNode = float( rough ).add( mx_noise_float( p.mul( 7 ) ).mul( 0.08 ) );
	m.metalnessNode = float( 0.6 );
	return m;

}

export function brushedSteel() {

	const m = new THREE.MeshStandardNodeMaterial();
	m.colorNode = vec3( 0.62, 0.62, 0.6 );
	m.roughnessNode = float( 0.32 ).add( mx_noise_float( positionWorld.mul( vec3( 1, 60, 1 ) ) ).mul( 0.06 ) );
	m.metalnessNode = float( 1 );
	return m;

}

export { patternFade, camDist, lin };
