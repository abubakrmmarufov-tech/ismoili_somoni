// Shared TSL building blocks for procedural materials.

import {
	Fn, float, vec2, vec3, vec4, abs, floor, fract, mix, step, max, min, dot, sin, smoothstep,
	positionView, normalView, normalWorld, positionWorld, mx_noise_float, mx_fractal_noise_float,
	mx_worley_noise_float, mx_cell_noise_float
} from 'three/tsl';

/**
 * Screen-space-derivative bump mapping (Mikkelsen surface gradient) for any
 * scalar height expression. Returns a view-space normal for `material.normalNode`.
 */
export function bumpNormal( height, baseNormal = normalView ) {

	const dpdx = positionView.dFdx();
	const dpdy = positionView.dFdy();
	const r1 = dpdy.cross( baseNormal );
	const r2 = baseNormal.cross( dpdx );
	const det = dpdx.dot( r1 );
	const grad = det.sign().mul( height.dFdx().mul( r1 ).add( height.dFdy().mul( r2 ) ) );
	return det.abs().mul( baseNormal ).sub( grad ).normalize();

}

/**
 * World-space planar projection picked by the dominant axis of the world normal:
 * walls facing ±Z use (x, y), walls facing ±X use (z, y), floors use (x, z).
 * Returns vec3(u, v, axisId) where axisId 0 = X-facing, 1 = Y-facing, 2 = Z-facing.
 */
export const dominantPlanar = Fn( ( [ p, n ] ) => {

	const a = abs( n );
	const isY = step( max( a.x, a.z ), a.y );
	const isZ = step( a.x, a.z ).mul( isY.oneMinus() );
	const isX = isY.oneMinus().mul( isZ.oneMinus() );
	const uv = vec2( p.z, p.y ).mul( isX ).add( vec2( p.x, p.z ).mul( isY ) ).add( vec2( p.x, p.y ).mul( isZ ) );
	return vec3( uv, isY.add( isZ.mul( 2 ) ) );

} );

/**
 * Stone cladding / paving grid in running bond.
 * Returns vec4(edgeDistance [m], cellId [0,1), jointMask [0 = joint, 1 = stone], rowId).
 */
export const runningBond = Fn( ( [ uv, size, joint ] ) => {

	const row = floor( uv.y.div( size.y ) );
	const offset = fract( row.mul( 0.5 ) ).mul( size.x );
	const u = uv.x.add( offset );
	const col = floor( u.div( size.x ) );
	const lu = fract( u.div( size.x ) );
	const lv = fract( uv.y.div( size.y ) );
	const du = min( lu, lu.oneMinus() ).mul( size.x );
	const dv = min( lv, lv.oneMinus() ).mul( size.y );
	const edge = min( du, dv );
	const mask = smoothstep( joint.mul( 0.5 ), joint, edge );
	const id = mx_cell_noise_float( vec2( col, row ) );
	return vec4( edge, id, mask, row );

} );

export const fbm = ( p, oct = 4 ) => mx_fractal_noise_float( p, oct, 2.0, 0.5 );
export const noise = ( p ) => mx_noise_float( p );
export const worley = ( p ) => mx_worley_noise_float( p );
export const cellNoise = ( p ) => mx_cell_noise_float( p );

/** Luminance of a linear RGB colour. */
export const luma = ( c ) => dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );

/** Grime that collects where rain runs down vertical faces (world-space streaks). */
export const rainStreaks = Fn( ( [ p, n, scale ] ) => {

	const vertical = smoothstep( 0.6, 0.2, abs( n.y ) );
	const streak = mx_noise_float( vec3( p.x.mul( scale ), p.y.mul( scale ).mul( 0.08 ), p.z.mul( scale ) ) ).mul( 0.5 ).add( 0.5 );
	const breakup = mx_noise_float( p.mul( scale.mul( 0.15 ) ) ).mul( 0.5 ).add( 0.5 );
	return smoothstep( 0.55, 0.85, streak ).mul( breakup ).mul( vertical );

} );

export { positionWorld, normalWorld, sin };
