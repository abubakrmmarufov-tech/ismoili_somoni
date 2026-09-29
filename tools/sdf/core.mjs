// Signed-distance-field sculpting toolkit.
//
// Every shape is a plain function (x, y, z) => distance with an optional `.b`
// axis-aligned bound [minX, minY, minZ, maxX, maxY, maxZ]. Unions use the bound
// as a conservative lower limit so far-away primitives are skipped, which keeps
// narrow-band meshing of 60+ primitive sculptures fast in plain JavaScript.

const { sqrt, abs, max, min, cos, sin, floor, hypot } = Math;

export const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );
export const mix = ( a, b, t ) => a + ( b - a ) * t;
export const smoothstep = ( a, b, v ) => {

	const t = clamp( ( v - a ) / ( b - a ), 0, 1 );
	return t * t * ( 3 - 2 * t );

};

// ---------------------------------------------------------------- operators

export function smin( a, b, k ) {

	if ( k <= 0 ) return a < b ? a : b;
	const h = max( k - abs( a - b ), 0 ) / k;
	return min( a, b ) - h * h * k * 0.25;

}

export function smax( a, b, k ) {

	return - smin( - a, - b, k );

}

function boxDist( b, x, y, z ) {

	const dx = max( b[ 0 ] - x, 0, x - b[ 3 ] );
	const dy = max( b[ 1 ] - y, 0, y - b[ 4 ] );
	const dz = max( b[ 2 ] - z, 0, z - b[ 5 ] );
	return sqrt( dx * dx + dy * dy + dz * dz );

}

function mergeBounds( list, pad = 0 ) {

	const out = [ Infinity, Infinity, Infinity, - Infinity, - Infinity, - Infinity ];
	for ( const b of list ) {

		if ( ! b ) return null;
		for ( let i = 0; i < 3; i ++ ) {

			out[ i ] = min( out[ i ], b[ i ] - pad );
			out[ i + 3 ] = max( out[ i + 3 ], b[ i + 3 ] + pad );

		}

	}

	return out;

}

export function withBounds( fn, b ) {

	fn.b = b;
	return fn;

}

export function pad( fn, amount ) {

	if ( fn.b ) fn.b = mergeBounds( [ fn.b ], amount );
	return fn;

}

/** Smooth union of any number of shapes with blend radius k. */
export function union( k, ...shapes ) {

	shapes = shapes.flat().filter( Boolean );
	const n = shapes.length;
	const f = ( x, y, z ) => {

		let d = 1e9;
		for ( let i = 0; i < n; i ++ ) {

			const s = shapes[ i ];
			const b = s.b;
			if ( b !== undefined && b !== null ) {

				const bd = boxDist( b, x, y, z );
				if ( bd - k > d ) continue;

			}

			const ds = s( x, y, z );
			d = smin( d, ds, k );

		}

		return d;

	};

	f.b = mergeBounds( shapes.map( ( s ) => s.b ), k );
	return f;

}

/** Carve `cutter` out of `base` with a smooth edge of radius k. */
export function subtract( k, base, ...cutters ) {

	cutters = cutters.flat().filter( Boolean );
	const f = ( x, y, z ) => {

		let d = base( x, y, z );
		for ( const c of cutters ) {

			if ( c.b && boxDist( c.b, x, y, z ) > k + 1e-4 ) continue;
			d = smax( d, - c( x, y, z ), k );

		}

		return d;

	};

	f.b = base.b;
	return f;

}

export function intersect( k, a, b ) {

	const f = ( x, y, z ) => smax( a( x, y, z ), b( x, y, z ), k );
	f.b = a.b && b.b ? [
		max( a.b[ 0 ], b.b[ 0 ] ), max( a.b[ 1 ], b.b[ 1 ] ), max( a.b[ 2 ], b.b[ 2 ] ),
		min( a.b[ 3 ], b.b[ 3 ] ), min( a.b[ 4 ], b.b[ 4 ] ), min( a.b[ 5 ], b.b[ 5 ] )
	] : ( a.b || b.b );
	return f;

}

/** Adds a displacement field (positive = inflate). `amp` bounds its magnitude. */
export function displace( shape, fn, amp ) {

	const f = ( x, y, z ) => {

		const d = shape( x, y, z );
		if ( d > amp * 2 ) return d - amp; // far from the surface the detail cannot matter
		return d - fn( x, y, z );

	};

	f.b = shape.b ? mergeBounds( [ shape.b ], amp ) : undefined;
	return f;

}

export function mirrorX( shape ) {

	const f = ( x, y, z ) => shape( abs( x ), y, z );
	if ( shape.b ) {

		const b = shape.b;
		const m = max( abs( b[ 0 ] ), abs( b[ 3 ] ) );
		f.b = [ - m, b[ 1 ], b[ 2 ], m, b[ 4 ], b[ 5 ] ];

	}

	return f;

}

/** Evaluates `shape` in a local frame: p_local = R^T (p - origin). */
export function transform( shape, origin, R ) {

	const [ ox, oy, oz ] = origin;
	const f = ( x, y, z ) => {

		const px = x - ox, py = y - oy, pz = z - oz;
		return shape(
			R[ 0 ] * px + R[ 1 ] * py + R[ 2 ] * pz,
			R[ 3 ] * px + R[ 4 ] * py + R[ 5 ] * pz,
			R[ 6 ] * px + R[ 7 ] * py + R[ 8 ] * pz
		);

	};

	if ( shape.b ) {

		// transform the 8 corners of the local bound
		const b = shape.b;
		const pts = [];
		for ( let i = 0; i < 8; i ++ ) {

			const lx = i & 1 ? b[ 3 ] : b[ 0 ];
			const ly = i & 2 ? b[ 4 ] : b[ 1 ];
			const lz = i & 4 ? b[ 5 ] : b[ 2 ];
			pts.push( [
				ox + R[ 0 ] * lx + R[ 3 ] * ly + R[ 6 ] * lz,
				oy + R[ 1 ] * lx + R[ 4 ] * ly + R[ 7 ] * lz,
				oz + R[ 2 ] * lx + R[ 5 ] * ly + R[ 8 ] * lz
			] );

		}

		f.b = [
			min( ...pts.map( ( p ) => p[ 0 ] ) ), min( ...pts.map( ( p ) => p[ 1 ] ) ), min( ...pts.map( ( p ) => p[ 2 ] ) ),
			max( ...pts.map( ( p ) => p[ 0 ] ) ), max( ...pts.map( ( p ) => p[ 1 ] ) ), max( ...pts.map( ( p ) => p[ 2 ] ) )
		];

	}

	return f;

}

// Column-major 3x3 rotation matrices: columns are the local X, Y, Z axes in world space.
export function rotY( a ) {

	const c = cos( a ), s = sin( a );
	return [ c, 0, - s, 0, 1, 0, s, 0, c ];

}

export function rotX( a ) {

	const c = cos( a ), s = sin( a );
	return [ 1, 0, 0, 0, c, s, 0, - s, c ];

}

export function rotZ( a ) {

	const c = cos( a ), s = sin( a );
	return [ c, s, 0, - s, c, 0, 0, 0, 1 ];

}

export function mulR( A, B ) {

	const out = new Array( 9 );
	for ( let c = 0; c < 3; c ++ ) {

		for ( let r = 0; r < 3; r ++ ) {

			out[ c * 3 + r ] = A[ r ] * B[ c * 3 ] + A[ 3 + r ] * B[ c * 3 + 1 ] + A[ 6 + r ] * B[ c * 3 + 2 ];

		}

	}

	return out;

}

/** Rotation whose local +Y axis points along `dir`. */
export function alignY( dir ) {

	const l = hypot( dir[ 0 ], dir[ 1 ], dir[ 2 ] );
	const y = [ dir[ 0 ] / l, dir[ 1 ] / l, dir[ 2 ] / l ];
	const ref = abs( y[ 2 ] ) < 0.9 ? [ 0, 0, 1 ] : [ 1, 0, 0 ];
	let x = cross( y, ref );
	const xl = hypot( ...x );
	x = x.map( ( v ) => v / xl );
	const z = cross( x, y );
	return [ ...x, ...y, ...z ];

}

export const cross = ( a, b ) => [ a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ], a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] ];
export const add3 = ( a, b ) => [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ], a[ 2 ] + b[ 2 ] ];
export const sub3 = ( a, b ) => [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];
export const scale3 = ( a, s ) => [ a[ 0 ] * s, a[ 1 ] * s, a[ 2 ] * s ];
export const lerp3 = ( a, b, t ) => [ mix( a[ 0 ], b[ 0 ], t ), mix( a[ 1 ], b[ 1 ], t ), mix( a[ 2 ], b[ 2 ], t ) ];
export const norm3 = ( a ) => {

	const l = hypot( a[ 0 ], a[ 1 ], a[ 2 ] ) || 1;
	return [ a[ 0 ] / l, a[ 1 ] / l, a[ 2 ] / l ];

};

// --------------------------------------------------------------- primitives

export function sphere( c, r ) {

	const [ cx, cy, cz ] = c;
	return withBounds( ( x, y, z ) => sqrt( ( x - cx ) ** 2 + ( y - cy ) ** 2 + ( z - cz ) ** 2 ) - r,
		[ cx - r, cy - r, cz - r, cx + r, cy + r, cz + r ] );

}

/** Approximate ellipsoid (iq), optionally rotated by R. */
export function ellipsoid( c, r, R = null ) {

	const [ rx, ry, rz ] = r;
	const local = ( x, y, z ) => {

		const k0 = sqrt( ( x / rx ) ** 2 + ( y / ry ) ** 2 + ( z / rz ) ** 2 );
		const k1 = sqrt( ( x / ( rx * rx ) ) ** 2 + ( y / ( ry * ry ) ) ** 2 + ( z / ( rz * rz ) ) ** 2 );
		return k1 > 0 ? k0 * ( k0 - 1 ) / k1 : - min( rx, ry, rz );

	};

	local.b = [ - rx, - ry, - rz, rx, ry, rz ];
	return transform( local, c, R || [ 1, 0, 0, 0, 1, 0, 0, 0, 1 ] );

}

/** Exact round cone between points a and b with radii ra, rb (iq). */
export function roundCone( a, b, ra, rb ) {

	const bax = b[ 0 ] - a[ 0 ], bay = b[ 1 ] - a[ 1 ], baz = b[ 2 ] - a[ 2 ];
	const rba = rb - ra;
	const baba = bax * bax + bay * bay + baz * baz;
	const l2 = baba - rba * rba;
	const a2 = l2 > 0 ? l2 : 1e-9;
	const f = ( x, y, z ) => {

		const pax = x - a[ 0 ], pay = y - a[ 1 ], paz = z - a[ 2 ];
		const papa = pax * pax + pay * pay + paz * paz;
		const paba = pax * bax + pay * bay + paz * baz;
		const xx = ( pax * baba - bax * paba ), xy = ( pay * baba - bay * paba ), xz = ( paz * baba - baz * paba );
		const x2 = xx * xx + xy * xy + xz * xz;
		const yv = paba - baba;
		const y2 = yv * yv * baba;
		const z2 = paba * paba * baba;
		const k = Math.sign( rba ) * rba * rba * x2;
		if ( Math.sign( yv ) * a2 * y2 > k ) return sqrt( x2 + y2 ) / baba - rb;
		if ( Math.sign( paba ) * a2 * z2 < k ) return sqrt( papa ) - ra;
		return ( sqrt( x2 * a2 * baba ) + paba * rba * baba ) / ( baba * a2 ) - ra;

	};

	const r = max( ra, rb );
	f.b = [
		min( a[ 0 ], b[ 0 ] ) - r, min( a[ 1 ], b[ 1 ] ) - r, min( a[ 2 ], b[ 2 ] ) - r,
		max( a[ 0 ], b[ 0 ] ) + r, max( a[ 1 ], b[ 1 ] ) + r, max( a[ 2 ], b[ 2 ] ) + r
	];
	return f;

}

export const capsule = ( a, b, r ) => roundCone( a, b, r, r );

/** Chain of round cones through points with per-point radii, smoothly blended. */
export function tube( points, radii, k = 0.01 ) {

	const parts = [];
	for ( let i = 0; i < points.length - 1; i ++ ) parts.push( roundCone( points[ i ], points[ i + 1 ], radii[ i ], radii[ i + 1 ] ) );
	return union( k, parts );

}

export function roundBox( c, half, r, R = null ) {

	const [ hx, hy, hz ] = half;
	const local = ( x, y, z ) => {

		const qx = abs( x ) - hx + r, qy = abs( y ) - hy + r, qz = abs( z ) - hz + r;
		const ox = max( qx, 0 ), oy = max( qy, 0 ), oz = max( qz, 0 );
		return sqrt( ox * ox + oy * oy + oz * oz ) + min( max( qx, qy, qz ), 0 ) - r;

	};

	local.b = [ - hx, - hy, - hz, hx, hy, hz ];
	return transform( local, c, R || [ 1, 0, 0, 0, 1, 0, 0, 0, 1 ] );

}

/** Torus in the local XZ plane. */
export function torus( c, R0, r, R = null ) {

	const local = ( x, y, z ) => {

		const q = sqrt( x * x + z * z ) - R0;
		return sqrt( q * q + y * y ) - r;

	};

	local.b = [ - R0 - r, - r, - R0 - r, R0 + r, r, R0 + r ];
	return transform( local, c, R || [ 1, 0, 0, 0, 1, 0, 0, 0, 1 ] );

}

/** Capped vertical cylinder in local frame, rounded edge radius rr. */
export function cylinder( c, radius, halfH, rr = 0, R = null ) {

	const local = ( x, y, z ) => {

		const dx = sqrt( x * x + z * z ) - radius + rr;
		const dy = abs( y ) - halfH + rr;
		return min( max( dx, dy ), 0 ) + hypot( max( dx, 0 ), max( dy, 0 ) ) - rr;

	};

	local.b = [ - radius, - halfH, - radius, radius, halfH, radius ];
	return transform( local, c, R || [ 1, 0, 0, 0, 1, 0, 0, 0, 1 ] );

}

/** Five-pointed star in the local XY plane, extruded along Z with rounded edges. */
export function star( c, rOuter, rInner, halfDepth, R = null, points = 5 ) {

	const an = Math.PI / points;
	const local = ( x, y, z ) => {

		// 2D star SDF (iq's sdStar with m = points)
		let px = x, py = y;
		const ang = Math.atan2( px, py );
		const bn = ( ( ang % ( 2 * an ) ) + 2 * an ) % ( 2 * an ) - an;
		const l = hypot( px, py );
		px = l * cos( bn );
		py = l * abs( sin( bn ) );
		// edge from outer tip (rOuter, 0) to inner valley (rInner cos an, rInner sin an)
		const ax = rOuter, ay = 0;
		const bx = rInner * cos( an ), by = rInner * sin( an );
		const ex = bx - ax, ey = by - ay;
		const wx = px - ax, wy = py - ay;
		const t = clamp( ( wx * ex + wy * ey ) / ( ex * ex + ey * ey ), 0, 1 );
		const qx = wx - ex * t, qy = wy - ey * t;
		const sgn = ( ex * wy - ey * wx ) > 0 ? - 1 : 1;
		const d2 = sgn * hypot( qx, qy );
		const dz = abs( z ) - halfDepth;
		return min( max( d2, dz ), 0 ) + hypot( max( d2, 0 ), max( dz, 0 ) );

	};

	local.b = [ - rOuter, - rOuter, - halfDepth, rOuter, rOuter, halfDepth ];
	return transform( local, c, R || [ 1, 0, 0, 0, 1, 0, 0, 0, 1 ] );

}

// ------------------------------------------------------------------- noise

const perm = new Uint8Array( 512 );
{

	let s = 1337;
	const p = new Uint8Array( 256 );
	for ( let i = 0; i < 256; i ++ ) p[ i ] = i;
	for ( let i = 255; i > 0; i -- ) {

		s = ( s * 16807 ) % 2147483647;
		const j = s % ( i + 1 );
		[ p[ i ], p[ j ] ] = [ p[ j ], p[ i ] ];

	}

	for ( let i = 0; i < 512; i ++ ) perm[ i ] = p[ i & 255 ];

}

const G = [ [ 1, 1, 0 ], [ - 1, 1, 0 ], [ 1, - 1, 0 ], [ - 1, - 1, 0 ], [ 1, 0, 1 ], [ - 1, 0, 1 ], [ 1, 0, - 1 ], [ - 1, 0, - 1 ], [ 0, 1, 1 ], [ 0, - 1, 1 ], [ 0, 1, - 1 ], [ 0, - 1, - 1 ], [ 1, 1, 0 ], [ - 1, 1, 0 ], [ 0, - 1, 1 ], [ 0, - 1, - 1 ] ];
const fade = ( t ) => t * t * t * ( t * ( t * 6 - 15 ) + 10 );
const grad = ( h, x, y, z ) => {

	const g = G[ h & 15 ];
	return g[ 0 ] * x + g[ 1 ] * y + g[ 2 ] * z;

};

/** Classic Perlin gradient noise in roughly [-1, 1]. */
export function noise3( x, y, z ) {

	const X = floor( x ), Y = floor( y ), Z = floor( z );
	x -= X; y -= Y; z -= Z;
	const xi = X & 255, yi = Y & 255, zi = Z & 255;
	const u = fade( x ), v = fade( y ), w = fade( z );
	const A = perm[ xi ] + yi, AA = perm[ A ] + zi, AB = perm[ A + 1 ] + zi;
	const B = perm[ xi + 1 ] + yi, BA = perm[ B ] + zi, BB = perm[ B + 1 ] + zi;
	return mix(
		mix( mix( grad( perm[ AA ], x, y, z ), grad( perm[ BA ], x - 1, y, z ), u ),
			mix( grad( perm[ AB ], x, y - 1, z ), grad( perm[ BB ], x - 1, y - 1, z ), u ), v ),
		mix( mix( grad( perm[ AA + 1 ], x, y, z - 1 ), grad( perm[ BA + 1 ], x - 1, y, z - 1 ), u ),
			mix( grad( perm[ AB + 1 ], x, y - 1, z - 1 ), grad( perm[ BB + 1 ], x - 1, y - 1, z - 1 ), u ), v ), w ) * 1.4;

}

export function fbm3( x, y, z, oct = 4, lac = 2.03, gain = 0.5 ) {

	let a = 0.5, s = 0;
	for ( let i = 0; i < oct; i ++ ) {

		s += a * noise3( x, y, z );
		x *= lac; y *= lac; z *= lac;
		a *= gain;

	}

	return s;

}

/** Deterministic PRNG for reproducible builds. */
export function rng( seed = 1 ) {

	let s = seed >>> 0;
	return () => {

		s = ( s + 0x6D2B79F5 ) >>> 0;
		let t = s;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}
