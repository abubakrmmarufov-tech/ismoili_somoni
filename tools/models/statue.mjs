// Ismoili Somoni — sculpted as a signed distance field.
//
// Modelled in "human units" (a 1.9 m figure, feet at y = 0, facing +Z, the
// figure's right hand on -X) and scaled to the real ~13 m statue at export.
// The right arm raises the seven-star sceptre, a cloak falls from the
// shoulders, and the long Samanid robe breaks into folds towards the hem.

import {
	union, subtract, displace, withBounds, smin, smax,
	sphere, ellipsoid, roundCone, capsule, tube, roundBox, torus, cylinder, star,
	rotX, rotY, rotZ, mulR, alignY, noise3, fbm3, clamp, mix, smoothstep, lerp3, sub3, add3, scale3, norm3
} from '../sdf/core.mjs';

const { sqrt, abs, atan2, sin, cos, max, min, hypot, PI, pow } = Math;

// iq's approximate ellipse distance
function ell( x, z, rx, rz ) {

	const k0 = sqrt( ( x / rx ) ** 2 + ( z / rz ) ** 2 );
	const k1 = sqrt( ( x / ( rx * rx ) ) ** 2 + ( z / ( rz * rz ) ) ** 2 );
	return k1 > 0 ? k0 * ( k0 - 1 ) / k1 : - min( rx, rz );

}

// Catmull-Rom through [y, value] keys
function profile( keys ) {

	return ( y ) => {

		if ( y <= keys[ 0 ][ 0 ] ) return keys[ 0 ][ 1 ];
		if ( y >= keys[ keys.length - 1 ][ 0 ] ) return keys[ keys.length - 1 ][ 1 ];
		let i = 0;
		while ( y > keys[ i + 1 ][ 0 ] ) i ++;
		const p0 = keys[ max( 0, i - 1 ) ][ 1 ], p1 = keys[ i ][ 1 ], p2 = keys[ i + 1 ][ 1 ], p3 = keys[ min( keys.length - 1, i + 2 ) ][ 1 ];
		const t = ( y - keys[ i ][ 0 ] ) / ( keys[ i + 1 ][ 0 ] - keys[ i ][ 0 ] );
		const t2 = t * t, t3 = t2 * t;
		return 0.5 * ( 2 * p1 + ( - p0 + p2 ) * t + ( 2 * p0 - 5 * p1 + 4 * p2 - p3 ) * t2 + ( - p0 + 3 * p1 - 3 * p2 + p3 ) * t3 );

	};

}

// Cloth folds: rounded ridges with sharp creases, varying along the height.
function folds( theta, y, count, phase ) {

	const n = noise3( theta * 0.9 + phase, y * 1.1, phase * 3.1 );
	const a = 2 * abs( cos( theta * count * 0.5 + n * 1.1 + phase ) ) - 1;
	const b = 2 * abs( cos( theta * count * 0.79 + n * 1.4 + y * 0.9 + phase * 2 ) ) - 1;
	return a * 0.72 + b * 0.28;

}

// ---------------------------------------------------------------- the robe

const robeRX = profile( [ [ 0.0, 0.33 ], [ 0.25, 0.285 ], [ 0.6, 0.235 ], [ 0.95, 0.195 ], [ 1.05, 0.182 ], [ 1.22, 0.19 ], [ 1.34, 0.195 ], [ 1.44, 0.17 ] ] );
const robeRZ = profile( [ [ 0.0, 0.25 ], [ 0.25, 0.215 ], [ 0.6, 0.17 ], [ 0.95, 0.135 ], [ 1.05, 0.13 ], [ 1.22, 0.14 ], [ 1.34, 0.14 ], [ 1.44, 0.12 ] ] );
const robeCZ = profile( [ [ 0.0, 0.02 ], [ 0.5, 0.025 ], [ 1.0, 0.0 ], [ 1.3, 0.012 ], [ 1.44, 0.0 ] ] );

function robe( x, y, z ) {

	const cz = robeCZ( y );
	const rx = robeRX( y ), rz = robeRZ( y );
	let d = ell( x, z - cz, rx, rz );
	if ( d > 0.12 ) return d;

	const theta = atan2( x, z - cz );
	// fold amplitude grows towards the hem; the front panel stays calmer above the knee
	const hem = clamp( 1 - y / 1.0, 0, 1 );
	const front = smoothstep( 0.2, 1.2, abs( theta ) );
	let amp = 0.004 + 0.022 * pow( hem, 1.3 ) * mix( 0.55, 1, front );
	amp += 0.004 * smoothstep( 1.05, 1.3, y ) * front; // gathered folds above the belt
	d -= amp * folds( theta, y, 11, 0.7 );

	// knee of the relaxed left leg pushes the cloth forward
	const knee = ( x - 0.1 ) ** 2 / 0.012 + ( y - 0.55 ) ** 2 / 0.05;
	d -= 0.02 * Math.exp( - knee ) * smoothstep( - 0.2, 0.6, theta );

	// wrap-over edge of the caftan running diagonally down the front
	const edgeX = mix( 0.06, - 0.05, clamp( ( 1.42 - y ) / 1.4, 0, 1 ) );
	if ( z > cz ) d -= 0.006 * Math.exp( - ( ( x - edgeX ) ** 2 ) / 0.00018 ) * smoothstep( 0.05, 0.3, y );

	// cast-bronze surface undulation
	d -= 0.0007 * noise3( x * 22, y * 22, z * 22 );

	// wavy hem lifted slightly off the base
	const hemY = 0.035 + 0.012 * sin( theta * 5 + 0.8 ) + 0.008 * noise3( theta * 3, 1.7, 0 );
	d = smax( d, hemY - y, 0.012 );
	// top cap (shoulders take over)
	d = smax( d, y - 1.45, 0.04 );
	return d;

}

robe.b = [ - 0.4, 0.0, - 0.3, 0.4, 1.5, 0.35 ];

// ---------------------------------------------------------------- the cloak

const capeRX = profile( [ [ 0.0, 0.43 ], [ 0.4, 0.37 ], [ 0.9, 0.305 ], [ 1.2, 0.27 ], [ 1.38, 0.235 ], [ 1.48, 0.2 ] ] );
const capeRZ = profile( [ [ 0.0, 0.33 ], [ 0.4, 0.27 ], [ 0.9, 0.2 ], [ 1.2, 0.17 ], [ 1.38, 0.15 ], [ 1.48, 0.13 ] ] );
const capeCZ = profile( [ [ 0.0, - 0.1 ], [ 0.6, - 0.06 ], [ 1.2, - 0.02 ], [ 1.48, - 0.01 ] ] );

function cape( x, y, z ) {

	const cz = capeCZ( y );
	const rx = capeRX( y ), rz = capeRZ( y );
	let s = ell( x, z - cz, rx, rz );
	if ( s > 0.15 ) return s;
	const theta = atan2( x, z - cz );
	const hem = clamp( 1 - y / 1.3, 0, 1 );
	s -= ( 0.008 + 0.03 * pow( hem, 1.1 ) ) * folds( theta, y * 0.8, 9, 2.3 );
	s -= 0.0006 * noise3( x * 20, y * 20, z * 20 );
	let d = abs( s ) - 0.011;

	// open at the front: the cloak wraps further forward near the shoulders
	const openZ = cz + mix( 0.02, 0.1, smoothstep( 1.15, 1.45, y ) );
	d = smax( d, ( z - openZ ) * 1.0, 0.02 );
	// hem pooling at the back, top edge over the shoulders
	const hemY = 0.02 + 0.015 * sin( theta * 3 + 1.1 );
	d = smax( d, hemY - y, 0.01 );
	d = smax( d, y - 1.5, 0.03 );
	return d;

}

cape.b = [ - 0.5, 0.0, - 0.5, 0.5, 1.55, 0.2 ];

// ------------------------------------------------------------ helpers

function belt() {

	const y0 = 1.03;
	const f = ( x, y, z ) => {

		const cz = robeCZ( y0 );
		const e = ell( x, z - cz, robeRX( y0 ) + 0.012, robeRZ( y0 ) + 0.012 );
		const band = max( abs( e ) - 0.012, abs( y - y0 - 0.004 * sin( atan2( x, z ) * 2 ) ) - 0.026 );
		return band - 0.004;

	};

	f.b = [ - 0.25, 0.97, - 0.2, 0.25, 1.09, 0.2 ];
	// knot and hanging sash ends on the front-left
	const knot = ellipsoid( [ 0.05, 1.025, 0.155 ], [ 0.035, 0.03, 0.02 ] );
	const end1 = tube( [ [ 0.045, 1.0, 0.16 ], [ 0.06, 0.85, 0.2 ], [ 0.07, 0.68, 0.215 ] ], [ 0.016, 0.014, 0.012 ], 0.01 );
	const end2 = tube( [ [ 0.065, 1.0, 0.155 ], [ 0.1, 0.87, 0.19 ], [ 0.115, 0.74, 0.2 ] ], [ 0.015, 0.013, 0.011 ], 0.01 );
	const flat = ( s ) => {

		const g = ( x, y, z ) => s( x, y, z * 1 ) + 0.0;
		g.b = s.b;
		return g;

	};

	return union( 0.012, f, knot, flat( end1 ), flat( end2 ) );

}

function crownShape( center, radius, height, points, pointH, scale = 1 ) {

	const [ cx, cy, cz ] = center;
	const f = ( x, y, z ) => {

		const px = x - cx, py = y - cy, pz = z - cz;
		const r = hypot( px, pz * 0.95 );
		// band
		let d = max( abs( r - radius ) - 0.007 * scale, abs( py - height * 0.5 ) - height * 0.5 );
		// rims
		const rimT = hypot( r - radius - 0.003 * scale, py - height ) - 0.006 * scale;
		const rimB = hypot( r - radius - 0.003 * scale, py ) - 0.007 * scale;
		d = smin( d, min( rimT, rimB ), 0.004 * scale );
		// jewels on the band
		const phi = atan2( px, pz );
		const seg = ( 2 * PI ) / points;
		const a = ( ( phi % seg ) + seg ) % seg - seg * 0.5;
		const u = r * a;
		const jewel = hypot( u, py - height * 0.5, r - radius - 0.006 * scale ) - 0.009 * scale;
		d = smin( d, jewel, 0.003 * scale );
		// pointed lotus merlons
		const v = py - height;
		const w = 0.55 * seg * radius * pow( clamp( 1 - v / pointH, 0, 1 ), 0.75 );
		let merlon = max( abs( r - radius ) - 0.0055 * scale, abs( u ) - w );
		merlon = max( merlon, - v, v - pointH );
		d = smin( d, merlon, 0.004 * scale );
		// small orbs on each tip
		const tip = hypot( u, v - pointH + 0.001 * scale, r - radius ) - 0.0085 * scale;
		return smin( d, tip, 0.006 * scale );

	};

	const R = radius + 0.02 * scale;
	f.b = [ cx - R, cy - 0.01, cz - R, cx + R, cy + height + pointH + 0.02 * scale, cz + R ];
	return f;

}

// fist wrapped around a vertical shaft at `c`
function fist( c, shaftR, handR ) {

	const [ cx, cy, cz ] = c;
	const parts = [ ellipsoid( [ cx + 0.012, cy, cz - 0.012 ], [ 0.04, 0.052, 0.042 ] ) ];
	for ( let i = 0; i < 4; i ++ ) {

		const y = cy + 0.03 - i * 0.021;
		const r = shaftR + 0.013;
		const pts = [];
		for ( let a = - 0.6; a <= 2.6; a += 0.8 ) pts.push( [ cx + sin( a ) * r * 1.0 + 0.004, y - a * 0.002, cz + cos( a ) * r ] );
		parts.push( tube( pts, pts.map( ( _, j ) => 0.012 - j * 0.0008 ), 0.006 ) );

	}

	// thumb over the fingers
	parts.push( tube( [ [ cx + 0.03, cy + 0.03, cz - 0.02 ], [ cx + 0.02, cy + 0.045, cz + 0.02 ], [ cx - 0.005, cy + 0.04, cz + 0.035 ] ], [ 0.014, 0.012, 0.011 ], 0.006 ) );
	return union( 0.008, parts );

}

// open relaxed hand; `wrist` → `dir` along the fingers, `palmN` palm normal
function openHand( wrist, dir, side ) {

	const d = norm3( dir );
	const up = [ 0, 1, 0 ];
	const across = norm3( [ d[ 1 ] * up[ 2 ] - d[ 2 ] * up[ 1 ], d[ 2 ] * up[ 0 ] - d[ 0 ] * up[ 2 ], d[ 0 ] * up[ 1 ] - d[ 1 ] * up[ 0 ] ] );
	const palmN = norm3( [ across[ 1 ] * d[ 2 ] - across[ 2 ] * d[ 1 ], across[ 2 ] * d[ 0 ] - across[ 0 ] * d[ 2 ], across[ 0 ] * d[ 1 ] - across[ 1 ] * d[ 0 ] ] );
	const at = ( a, b, c ) => add3( add3( add3( wrist, scale3( d, a ) ), scale3( across, b ) ), scale3( palmN, c ) );
	const parts = [];
	parts.push( capsule( at( 0.02, 0.0, 0 ), at( 0.075, 0.0, 0 ), 0.033 ) );
	parts.push( capsule( at( 0.03, - 0.018, 0 ), at( 0.075, 0.02, 0 ), 0.027 ) );
	const lens = [ 0.075, 0.085, 0.08, 0.065 ];
	for ( let i = 0; i < 4; i ++ ) {

		const off = ( i - 1.5 ) * 0.019;
		const base = at( 0.09, off, 0 );
		const curl = 0.25 + i * 0.07;
		const p1 = add3( base, add3( scale3( d, lens[ i ] * 0.45 ), scale3( palmN, - lens[ i ] * 0.45 * sin( curl ) ) ) );
		const p2 = add3( p1, add3( scale3( d, lens[ i ] * 0.3 * cos( curl * 2 ) ), scale3( palmN, - lens[ i ] * 0.3 * sin( curl * 2 ) ) ) );
		const p3 = add3( p2, add3( scale3( d, lens[ i ] * 0.25 * cos( curl * 3 ) ), scale3( palmN, - lens[ i ] * 0.25 * sin( curl * 3 ) ) ) );
		parts.push( tube( [ base, p1, p2, p3 ], [ 0.0128, 0.0118, 0.0106, 0.0094 ], 0.004 ) );

	}

	// thumb
	const t0 = at( 0.03, side * 0.03, - 0.01 );
	const t1 = at( 0.07, side * 0.055, - 0.025 );
	const t2 = at( 0.1, side * 0.06, - 0.035 );
	parts.push( tube( [ t0, t1, t2 ], [ 0.015, 0.012, 0.01 ], 0.005 ) );
	return union( 0.009, parts );

}

// -------------------------------------------------------------- the figure

export function statue() {

	// ---- key joints
	const HEAD = [ 0, 1.635, 0.02 ];
	const SH_R = [ - 0.195, 1.43, 0.0 ], SH_L = [ 0.195, 1.43, 0.0 ];
	const EL_R = [ - 0.355, 1.655, 0.08 ], WR_R = [ - 0.37, 1.925, 0.14 ];
	const EL_L = [ 0.255, 1.165, 0.035 ], WR_L = [ 0.275, 1.035, 0.245 ];
	const FIST_R = [ - 0.372, 1.975, 0.152 ];
	const SC_BOT = [ - 0.372, 1.78, 0.155 ], SC_TOP = [ - 0.378, 2.3, 0.158 ];

	// ---- torso & neck
	const chest = ellipsoid( [ 0, 1.3, 0.012 ], [ 0.2, 0.19, 0.135 ] );
	const shoulders = capsule( SH_R, SH_L, 0.075 );
	const trap = ellipsoid( [ 0, 1.45, - 0.02 ], [ 0.15, 0.06, 0.09 ] );
	const neck = capsule( [ 0, 1.45, - 0.005 ], [ 0, 1.57, 0.01 ], 0.052 );
	const collar = torus( [ 0, 1.475, 0.0 ], 0.07, 0.016, rotX( 0.12 ) );

	// ---- head
	const H = ( dx, dy, dz ) => [ HEAD[ 0 ] + dx, HEAD[ 1 ] + dy, HEAD[ 2 ] + dz ];
	const cranium = ellipsoid( H( 0, 0.015, - 0.012 ), [ 0.08, 0.098, 0.096 ] );
	const face = ellipsoid( H( 0, - 0.03, 0.028 ), [ 0.066, 0.078, 0.07 ] );
	const brow = capsule( H( - 0.042, 0.022, 0.078 ), H( 0.042, 0.022, 0.078 ), 0.016 );
	const cheekL = ellipsoid( H( 0.045, - 0.018, 0.068 ), [ 0.024, 0.02, 0.022 ] );
	const cheekR = ellipsoid( H( - 0.045, - 0.018, 0.068 ), [ 0.024, 0.02, 0.022 ] );
	const nose = roundCone( H( 0, 0.006, 0.095 ), H( 0, - 0.04, 0.114 ), 0.009, 0.014 );
	const nostrils = union( 0.004, ellipsoid( H( 0.012, - 0.043, 0.104 ), [ 0.011, 0.008, 0.01 ] ), ellipsoid( H( - 0.012, - 0.043, 0.104 ), [ 0.011, 0.008, 0.01 ] ) );
	const eyeL = sphere( H( 0.031, 0.002, 0.08 ), 0.0135 );
	const eyeR = sphere( H( - 0.031, 0.002, 0.08 ), 0.0135 );
	const lidL = capsule( H( 0.02, 0.012, 0.089 ), H( 0.043, 0.01, 0.083 ), 0.006 );
	const lidR = capsule( H( - 0.02, 0.012, 0.089 ), H( - 0.043, 0.01, 0.083 ), 0.006 );
	const sockets = [ sphere( H( 0.032, 0.006, 0.095 ), 0.016 ), sphere( H( - 0.032, 0.006, 0.095 ), 0.016 ) ];
	const ears = [ ellipsoid( H( 0.079, - 0.005, - 0.005 ), [ 0.012, 0.03, 0.02 ] ), ellipsoid( H( - 0.079, - 0.005, - 0.005 ), [ 0.012, 0.03, 0.02 ] ) ];

	const mustache = union( 0.006,
		tube( [ H( 0.004, - 0.056, 0.107 ), H( 0.03, - 0.066, 0.098 ), H( 0.052, - 0.088, 0.082 ) ], [ 0.009, 0.008, 0.005 ], 0.004 ),
		tube( [ H( - 0.004, - 0.056, 0.107 ), H( - 0.03, - 0.066, 0.098 ), H( - 0.052, - 0.088, 0.082 ) ], [ 0.009, 0.008, 0.005 ], 0.004 )
	);

	// beard: full, falling onto the chest, with combed strands
	const beardMass = union( 0.03,
		ellipsoid( H( 0, - 0.095, 0.058 ), [ 0.07, 0.07, 0.055 ] ),
		ellipsoid( H( 0, - 0.155, 0.07 ), [ 0.058, 0.07, 0.045 ] ),
		ellipsoid( H( 0, - 0.2, 0.078 ), [ 0.036, 0.04, 0.03 ] ),
		ellipsoid( H( 0.05, - 0.06, 0.03 ), [ 0.03, 0.05, 0.05 ] ),
		ellipsoid( H( - 0.05, - 0.06, 0.03 ), [ 0.03, 0.05, 0.05 ] )
	);
	const beard = displace( beardMass, ( x, y, z ) => {

		const w = x + 0.012 * noise3( x * 20, y * 12, z * 20 );
		const strands = 2 * abs( sin( w * 260 + y * 18 ) ) - 1;
		const locks = noise3( x * 60, y * 25, z * 60 );
		return 0.0028 * strands + 0.003 * locks;

	}, 0.006 );

	// hair at the back of the head below the crown, falling to the nape
	const hairMass = union( 0.03,
		ellipsoid( H( 0, - 0.02, - 0.035 ), [ 0.088, 0.085, 0.08 ] ),
		ellipsoid( H( 0, - 0.1, - 0.06 ), [ 0.075, 0.07, 0.05 ] )
	);
	const hair = displace( hairMass, ( x, y, z ) => {

		const a = atan2( x, z );
		return 0.003 * ( 2 * abs( sin( a * 22 + noise3( x * 15, y * 15, z * 15 ) * 1.5 ) ) - 1 ) + 0.002 * noise3( x * 50, y * 30, z * 50 );

	}, 0.005 );

	const lips = capsule( H( - 0.016, - 0.07, 0.098 ), H( 0.016, - 0.07, 0.098 ), 0.007 );

	let head = union( 0.018, cranium, face, cheekL, cheekR, ears );
	head = union( 0.008, head, brow, nose, nostrils );
	head = subtract( 0.01, head, sockets );
	head = union( 0.004, head, eyeL, eyeR, lidL, lidR, lips );
	head = union( 0.006, head, mustache );
	head = union( 0.012, head, beard, hair );

	// ---- crown
	const crown = union( 0.006,
		crownShape( H( 0, 0.058, - 0.008 ), 0.088, 0.05, 8, 0.075 ),
		ellipsoid( H( 0, 0.1, - 0.008 ), [ 0.083, 0.07, 0.087 ] ),
		sphere( H( 0, 0.178, - 0.008 ), 0.014 ),
		roundCone( H( 0, 0.185, - 0.008 ), H( 0, 0.225, - 0.008 ), 0.008, 0.002 )
	);

	// ---- right arm raised with the sceptre
	const upperR = roundCone( SH_R, EL_R, 0.064, 0.05 );
	const sleeveR = displace( union( 0.03,
		roundCone( lerp3( SH_R, EL_R, 0.15 ), EL_R, 0.078, 0.07 ),
		ellipsoid( [ - 0.325, 1.575, 0.045 ], [ 0.055, 0.1, 0.07 ], alignY( sub3( EL_R, SH_R ) ) ),
		roundCone( EL_R, lerp3( EL_R, WR_R, 0.3 ), 0.068, 0.05 )
	), ( x, y, z ) => 0.006 * folds( atan2( x + 0.33, z - 0.06 ), y * 6, 7, 1.9 ) + 0.001 * noise3( x * 40, y * 40, z * 40 ), 0.008 );
	const forearmR = roundCone( EL_R, WR_R, 0.045, 0.033 );
	const cuffR = torus( lerp3( EL_R, WR_R, 0.74 ), 0.036, 0.006, alignY( sub3( WR_R, EL_R ) ) );
	const armR = union( 0.02, upperR, sleeveR, forearmR, cuffR, fist( FIST_R, 0.017, 0.045 ) );

	// ---- the sceptre: shaft, orb, crown and the arc of seven stars
	const shaft = union( 0.004,
		capsule( SC_BOT, SC_TOP, 0.0155 ),
		torus( lerp3( SC_BOT, SC_TOP, 0.08 ), 0.019, 0.006 ),
		sphere( [ SC_BOT[ 0 ], SC_BOT[ 1 ] - 0.012, SC_BOT[ 2 ] ], 0.024 ),
		torus( lerp3( SC_BOT, SC_TOP, 0.62 ), 0.019, 0.005 ),
		torus( lerp3( SC_BOT, SC_TOP, 0.92 ), 0.02, 0.006 ),
		roundCone( lerp3( SC_BOT, SC_TOP, 0.94 ), [ SC_TOP[ 0 ], SC_TOP[ 1 ] + 0.02, SC_TOP[ 2 ] ], 0.016, 0.028 )
	);
	const T = ( dy ) => [ SC_TOP[ 0 ], SC_TOP[ 1 ] + dy, SC_TOP[ 2 ] ];
	const orb = sphere( T( 0.052 ), 0.032 );
	const miniCrown = crownShape( T( 0.078 ), 0.034, 0.024, 7, 0.032, 0.45 );
	const miniCap = ellipsoid( T( 0.1 ), [ 0.03, 0.03, 0.03 ] );
	const arcC = T( 0.13 );
	const arcR = 0.1;
	const stars = [];
	for ( let i = 0; i < 7; i ++ ) {

		const a = PI * ( 0.14 + 0.72 * i / 6 );
		stars.push( star( [ arcC[ 0 ] + cos( a ) * arcR, arcC[ 1 ] + sin( a ) * arcR, arcC[ 2 ] ], 0.025, 0.011, 0.0045, rotZ( a - PI / 2 ) ) );

	}

	const arc = withBounds( ( x, y, z ) => {

		const px = x - arcC[ 0 ], py = y - arcC[ 1 ], pz = z - arcC[ 2 ];
		const a = atan2( py, px );
		const ang = max( PI * 0.14 - a, a - PI * 0.86, 0 ) * arcR;
		const q = hypot( px, py ) - arcR;
		return hypot( q, pz, ang ) - 0.0035;

	}, [ arcC[ 0 ] - 0.1, arcC[ 1 ] - 0.02, arcC[ 2 ] - 0.01, arcC[ 0 ] + 0.1, arcC[ 1 ] + 0.1, arcC[ 2 ] + 0.01 ] );
	const stems = [];
	for ( let i = 0; i < 7; i += 2 ) {

		const a = PI * ( 0.14 + 0.72 * i / 6 );
		stems.push( capsule( T( 0.1 ), [ arcC[ 0 ] + cos( a ) * arcR * 0.8, arcC[ 1 ] + sin( a ) * arcR * 0.8, arcC[ 2 ] ], 0.0028 ) );

	}

	const sceptre = union( 0.004, shaft, orb, miniCrown, miniCap, arc, ...stems, ...stars );

	// ---- left arm, forearm forward in a calm gesture
	const upperL = roundCone( SH_L, EL_L, 0.064, 0.052 );
	const sleeveUpL = displace( roundCone( lerp3( SH_L, EL_L, 0.1 ), EL_L, 0.082, 0.075 ),
		( x, y, z ) => 0.005 * folds( atan2( x - 0.22, z ), y * 5, 6, 0.4 ), 0.006 );
	// wide bell sleeve hanging under the forearm
	const bell = displace( union( 0.04,
		roundCone( EL_L, lerp3( EL_L, WR_L, 0.86 ), 0.07, 0.088 ),
		roundCone( lerp3( EL_L, WR_L, 0.3 ), [ 0.272, 0.83, 0.16 ], 0.05, 0.035 ),
		ellipsoid( [ 0.27, 0.93, 0.17 ], [ 0.04, 0.09, 0.075 ] )
	), ( x, y, z ) => 0.007 * folds( atan2( x - 0.27, y - 1.0 ), z * 4 + y * 3, 8, 3.3 ) + 0.001 * noise3( x * 40, y * 40, z * 40 ), 0.009 );
	// hollow the sleeve mouth so the wrist emerges from inside
	const mouth = roundCone( lerp3( EL_L, WR_L, 0.83 ), lerp3( EL_L, WR_L, 1.15 ), 0.058, 0.07 );
	const bellOpen = subtract( 0.01, bell, mouth );
	const wristL = roundCone( lerp3( EL_L, WR_L, 0.6 ), WR_L, 0.04, 0.032 );
	const handL = openHand( WR_L, [ 0.02, - 0.25, 1 ], - 1 );
	const armL = union( 0.02, upperL, sleeveUpL, bellOpen, wristL, handL );

	// ---- boots peeking from under the hem
	const boots = union( 0.01,
		ellipsoid( [ 0.09, 0.035, 0.215 ], [ 0.045, 0.036, 0.075 ], rotY( 0.18 ) ),
		ellipsoid( [ - 0.085, 0.035, 0.2 ], [ 0.045, 0.036, 0.075 ], rotY( - 0.12 ) )
	);

	// ---- clasps holding the cloak
	const clasps = union( 0.005,
		cylinder( [ 0.13, 1.4, 0.115 ], 0.024, 0.006, 0.004, rotX( PI / 2 - 0.35 ) ),
		cylinder( [ - 0.13, 1.4, 0.115 ], 0.024, 0.006, 0.004, rotX( PI / 2 - 0.35 ) ),
		sphere( [ 0.13, 1.4, 0.123 ], 0.011 ),
		sphere( [ - 0.13, 1.4, 0.123 ], 0.011 )
	);

	// ---- bronze base plate the figure is cast onto
	const base = roundBox( [ 0, - 0.03, 0.0 ], [ 0.46, 0.035, 0.42 ], 0.012 );

	const torso = union( 0.05, chest, shoulders, trap );
	const body = union( 0.035, robe, torso, collar );
	const figure = union( 0.015,
		body,
		union( 0.03, neck, head ),
		crown,
		cape,
		belt(),
		armR,
		armL,
		boots,
		clasps
	);

	const all = union( 0.003, figure, sceptre, union( 0.015, base, boots ) );

	// region mask: 1 = burnished regalia (crown, sceptre, clasps), 0.5 = skin, 0 = cloth
	const region = ( x, y, z ) => {

		if ( y > HEAD[ 1 ] + 0.05 && hypot( x - HEAD[ 0 ], z - HEAD[ 2 ] ) < 0.12 ) return 1;
		if ( hypot( x - SC_TOP[ 0 ], z - SC_TOP[ 2 ] ) < 0.12 && y > SC_BOT[ 1 ] - 0.03 && y > 2.0 ) return 1;
		if ( hypot( x - SC_TOP[ 0 ], z - SC_TOP[ 2 ] ) < 0.03 && y > SC_BOT[ 1 ] - 0.04 ) return 1;
		if ( abs( abs( x ) - 0.13 ) < 0.035 && abs( y - 1.4 ) < 0.035 && z > 0.08 ) return 1;
		const dFace = hypot( ( x - HEAD[ 0 ] ) / 1.1, ( y - HEAD[ 1 ] + 0.01 ) / 1.2, z - HEAD[ 2 ] - 0.05 );
		if ( dFace < 0.075 && z > HEAD[ 2 ] + 0.04 && y > HEAD[ 1 ] - 0.06 ) return 0.5;
		if ( hypot( x - FIST_R[ 0 ], y - FIST_R[ 1 ], z - FIST_R[ 2 ] ) < 0.07 ) return 0.5;
		if ( hypot( x - WR_L[ 0 ] - 0.0, y - WR_L[ 1 ] + 0.02, z - WR_L[ 2 ] - 0.07 ) < 0.09 ) return 0.5;
		return 0;

	};

	return {
		sdf: all,
		region,
		bounds: [ - 0.56, - 0.075, - 0.52, 0.52, 2.6, 0.47 ],
		// ~13 m from the base plate to the top star
		worldScale: 5.1
	};

}
