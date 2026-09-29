// The gilded crown that tops the arch (≈5 m across), SDF sculpt in metres.
// The seven stars above it are built in the browser as extruded shapes.

import {
	union, subtract, displace, withBounds, smin, smax,
	sphere, ellipsoid, roundCone, capsule, torus, cylinder, star, rotZ, rotY, rotX,
	noise3, clamp, smoothstep
} from '../sdf/core.mjs';

const { abs, sin, cos, atan2, hypot, max, min, PI, pow } = Math;

export function crown() {

	const R = 2.15; // band radius
	const H = 0.95; // band height

	// band with rims and a frieze of jewelled medallions
	const band = withBounds( ( x, y, z ) => {

		const r = hypot( x, z );
		const phi = atan2( x, z );
		let d = max( abs( r - R ) - 0.09, abs( y - H * 0.5 ) - H * 0.5 );
		// rims
		d = smin( d, hypot( r - R - 0.04, y - H ) - 0.1, 0.03 );
		d = smin( d, hypot( r - R - 0.05, y ) - 0.12, 0.03 );
		d = smin( d, hypot( r - R - 0.02, y - 0.22 ) - 0.035, 0.02 );
		d = smin( d, hypot( r - R - 0.02, y - H + 0.2 ) - 0.035, 0.02 );
		// medallions
		const seg = 2 * PI / 16;
		const a = ( ( phi % seg ) + seg ) % seg - seg / 2;
		const u = a * r;
		const med = hypot( u, ( y - H * 0.5 ) * 1.2, max( 0, r - R - 0.06 ) ) - 0.17;
		d = smin( d, max( med, - ( r - R ) ), 0.03 );
		const gem = hypot( u, y - H * 0.5, r - R - 0.12 ) - 0.085;
		d = smin( d, gem, 0.02 );
		// small pearls between medallions
		const a2 = ( ( ( phi + seg / 2 ) % seg ) + seg ) % seg - seg / 2;
		const pearl = hypot( a2 * r, y - H * 0.5, r - R - 0.09 ) - 0.05;
		return smin( d, pearl, 0.015 );

	}, [ - R - 0.3, - 0.15, - R - 0.3, R + 0.3, H + 0.15, R + 0.3 ] );

	// eight tall lotus petals rising from the band, curving slightly outwards
	const petals = withBounds( ( x, y, z ) => {

		const r = hypot( x, z );
		const phi = atan2( x, z );
		const seg = 2 * PI / 8;
		const a = ( ( phi % seg ) + seg ) % seg - seg / 2;
		const v = y - H;
		const ph = 1.55;
		const t = clamp( v / ph, 0, 1 );
		const rr = R + 0.12 * t * t;
		const w = 0.6 * seg * R * pow( max( 0, sin( PI * ( 0.08 + 0.92 * ( 1 - t ) ) * 0.5 + 0.35 * ( 1 - t ) ) ), 1.1 ) * ( 1 - t * t * 0.9 );
		let d = max( abs( r - rr ) - 0.07, abs( a * r ) - w );
		d = max( d, - v, v - ph );
		// raised midrib
		const rib = max( hypot( a * r, r - rr - 0.06 ) - 0.06, max( - v, v - ph * 0.92 ) );
		d = smin( d, rib, 0.04 );
		// pearl at each tip
		const tip = hypot( a * r, v - ph - 0.02, r - rr ) - 0.13;
		return smin( d, tip, 0.05 );

	}, [ - R - 0.4, H - 0.1, - R - 0.4, R + 0.4, H + 1.8, R + 0.4 ] );

	// domed cap with eight meridian arches meeting at the orb
	const dome = withBounds( ( x, y, z ) => {

		const cy = H * 0.9;
		const r = hypot( x, z );
		const e = hypot( r / 2.0, ( y - cy ) / 1.75 );
		let d = ( e - 1 ) * 1.75;
		d = max( d, cy - y );
		const phi = atan2( x, z );
		const seg = 2 * PI / 8;
		const a = ( ( phi % seg ) + seg ) % seg - seg / 2;
		const ribDist = abs( a * r );
		const arch = max( abs( e - 1.03 ) * 1.8 - 0.07, ribDist - 0.12 );
		return smin( d, max( arch, cy - y ), 0.05 );

	}, [ - 2.3, H * 0.9 - 0.1, - 2.3, 2.3, H * 0.9 + 1.95, 2.3 ] );

	const orb = sphere( [ 0, H * 0.9 + 1.95, 0 ], 0.32 );
	const collar = torus( [ 0, H * 0.9 + 1.68, 0 ], 0.24, 0.07 );
	const finial = union( 0.03,
		roundCone( [ 0, H * 0.9 + 2.2, 0 ], [ 0, H * 0.9 + 2.75, 0 ], 0.09, 0.04 ),
		sphere( [ 0, H * 0.9 + 2.8, 0 ], 0.09 )
	);

	const all = union( 0.04, band, petals, dome, collar, orb, finial );
	const surf = displace( all, ( x, y, z ) => 0.004 * noise3( x * 6, y * 6, z * 6 ), 0.005 );

	return {
		sdf: surf,
		bounds: [ - 2.7, - 0.2, - 2.7, 2.7, H * 0.9 + 3.0, 2.7 ],
		worldScale: 1
	};

}
