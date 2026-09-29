// Reclining guardian lion (one of the pair flanking the arch), SDF sculpt.
// Modelled lying down facing +Z, ~2.3 units long, scaled to ~4.3 m at export.

import {
	union, subtract, displace, withBounds, smin, smax,
	sphere, ellipsoid, roundCone, capsule, tube, roundBox,
	rotX, rotY, rotZ, noise3, fbm3, clamp, smoothstep, mix
} from '../sdf/core.mjs';

const { abs, sin, cos, atan2, hypot, max, min, PI, sqrt } = Math;

function paw( c, dir = 0 ) {

	const [ x, y, z ] = c;
	const parts = [ ellipsoid( [ x, y + 0.01, z ], [ 0.1, 0.075, 0.13 ], rotY( dir ) ) ];
	for ( let i = 0; i < 4; i ++ ) {

		const o = ( i - 1.5 ) * 0.045;
		parts.push( ellipsoid( [ x + o * cos( dir ), y + 0.0, z + 0.1 - abs( o ) * 0.4 ], [ 0.028, 0.035, 0.04 ] ) );

	}

	return union( 0.025, parts );

}

export function lion() {

	const torso = union( 0.12,
		ellipsoid( [ 0, 0.43, - 0.28 ], [ 0.33, 0.33, 0.68 ] ),
		ellipsoid( [ 0, 0.56, 0.22 ], [ 0.31, 0.4, 0.34 ] ),
		ellipsoid( [ 0, 0.36, - 0.72 ], [ 0.34, 0.3, 0.32 ] )
	);

	// folded hind legs along the flanks
	const hind = [];
	for ( const s of [ - 1, 1 ] ) {

		hind.push( ellipsoid( [ s * 0.26, 0.36, - 0.7 ], [ 0.17, 0.28, 0.34 ], rotX( 0.25 ) ) );
		hind.push( roundCone( [ s * 0.3, 0.14, - 0.72 ], [ s * 0.32, 0.08, - 0.32 ], 0.1, 0.075 ) );
		hind.push( paw( [ s * 0.33, 0.035, - 0.26 ], s * 0.1 ) );

	}

	// front legs stretched forward
	const front = [];
	for ( const s of [ - 1, 1 ] ) {

		front.push( tube( [ [ s * 0.2, 0.55, 0.3 ], [ s * 0.22, 0.22, 0.36 ], [ s * 0.21, 0.1, 0.62 ], [ s * 0.2, 0.07, 0.86 ] ], [ 0.14, 0.1, 0.075, 0.07 ], 0.05 ) );
		front.push( paw( [ s * 0.2, 0.035, 0.92 ], 0 ) );

	}

	// mane: a heavy ruff of stylised flame-like locks
	const maneMass = union( 0.1,
		ellipsoid( [ 0, 0.92, 0.42 ], [ 0.37, 0.44, 0.34 ] ),
		ellipsoid( [ 0, 0.7, 0.34 ], [ 0.33, 0.3, 0.3 ] ),
		ellipsoid( [ 0, 1.02, 0.28 ], [ 0.28, 0.3, 0.3 ] )
	);
	const mane = displace( maneMass, ( x, y, z ) => {

		const a = atan2( x, z - 0.5 );
		const b = atan2( y - 0.95, hypot( x, z - 0.5 ) );
		const locks = 2 * abs( sin( a * 9 + noise3( x * 5, y * 5, z * 5 ) * 2.2 ) * sin( b * 7 + noise3( x * 4 + 3, y * 4, z * 4 ) * 2 ) ) - 0.7;
		return 0.03 * locks + 0.012 * noise3( x * 14, y * 14, z * 14 );

	}, 0.045 );

	// head
	const skull = ellipsoid( [ 0, 1.03, 0.66 ], [ 0.19, 0.19, 0.22 ] );
	const muzzle = union( 0.04,
		ellipsoid( [ 0, 0.93, 0.86 ], [ 0.13, 0.1, 0.12 ] ),
		ellipsoid( [ 0.055, 0.9, 0.9 ], [ 0.07, 0.07, 0.08 ] ),
		ellipsoid( [ - 0.055, 0.9, 0.9 ], [ 0.07, 0.07, 0.08 ] )
	);
	const noseBridge = roundCone( [ 0, 1.08, 0.8 ], [ 0, 0.99, 0.96 ], 0.05, 0.045 );
	const noseTip = ellipsoid( [ 0, 0.975, 0.985 ], [ 0.05, 0.032, 0.03 ] );
	const jaw = ellipsoid( [ 0, 0.83, 0.8 ], [ 0.1, 0.07, 0.11 ] );
	const brow = union( 0.03, ellipsoid( [ 0.07, 1.1, 0.8 ], [ 0.07, 0.035, 0.05 ] ), ellipsoid( [ - 0.07, 1.1, 0.8 ], [ 0.07, 0.035, 0.05 ] ) );
	const cheeks = union( 0.04, ellipsoid( [ 0.13, 0.95, 0.72 ], [ 0.08, 0.1, 0.1 ] ), ellipsoid( [ - 0.13, 0.95, 0.72 ], [ 0.08, 0.1, 0.1 ] ) );
	const ears = union( 0.02, ellipsoid( [ 0.16, 1.2, 0.55 ], [ 0.06, 0.07, 0.035 ] ), ellipsoid( [ - 0.16, 1.2, 0.55 ], [ 0.06, 0.07, 0.035 ] ) );
	const eyes = [ sphere( [ 0.075, 1.055, 0.84 ], 0.03 ), sphere( [ - 0.075, 1.055, 0.84 ], 0.03 ) ];
	const eyeballs = union( 0.01, sphere( [ 0.073, 1.052, 0.828 ], 0.024 ), sphere( [ - 0.073, 1.052, 0.828 ], 0.024 ) );
	const mouth = capsule( [ - 0.07, 0.875, 0.9 ], [ 0.07, 0.875, 0.9 ], 0.008 );

	let head = union( 0.05, skull, muzzle, jaw, cheeks, brow );
	head = union( 0.025, head, noseBridge, noseTip, ears );
	head = subtract( 0.02, head, eyes, mouth );
	head = union( 0.01, head, eyeballs );

	// tail curling round the right haunch with a tuft
	const tail = union( 0.03,
		tube( [ [ 0, 0.35, - 1.0 ], [ - 0.2, 0.12, - 1.02 ], [ - 0.42, 0.06, - 0.78 ], [ - 0.46, 0.05, - 0.4 ], [ - 0.43, 0.05, - 0.1 ] ], [ 0.06, 0.05, 0.045, 0.04, 0.035 ], 0.03 ),
		displace( ellipsoid( [ - 0.42, 0.06, - 0.02 ], [ 0.06, 0.05, 0.1 ] ), ( x, y, z ) => 0.012 * noise3( x * 30, y * 30, z * 30 ), 0.015 )
	);

	const bodyAll = displace( union( 0.06, torso, ...hind, ...front ), ( x, y, z ) => 0.004 * noise3( x * 9, y * 9, z * 9 ) + 0.0015 * noise3( x * 30, y * 30, z * 30 ), 0.006 );

	// flatten the underside onto the plinth
	const all = union( 0.03, bodyAll, mane, head, tail );
	const f = ( x, y, z ) => smax( all( x, y, z ), - y, 0.02 );
	f.b = all.b;

	return {
		sdf: f,
		bounds: [ - 0.62, - 0.02, - 1.16, 0.62, 1.42, 1.12 ],
		worldScale: 1.85
	};

}
