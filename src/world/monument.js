// The monument: podium, statue plinth, lions, the 36 m iwan portal with its gilded
// muqarnas half-dome, the entablature, drum, crown and the arc of seven stars.
//
// Layout (metres): origin at the statue axis on the ground, the statue faces +Z
// (south). The portal face is at z = -5.2, the niche goes back to z ≈ -11.6.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
	Fn, float, vec2, vec3, abs, max, min, fract, floor, step, smoothstep, length, cos, sin, atan, mix, select, positionWorld, normalWorld,
	texture, uv, mx_noise_float
} from 'three/tsl';
import { gildedBronze, goldMosaic, travertine, redGranite, greyGranite, paving, patternFade } from './materials.js';
import { bumpNormal } from '../core/tsl-utils.js';

export const LAYOUT = {
	podiumTop: 1.2,
	podium: { x0: - 32, x1: 32, z0: - 24, z1: 16 },
	steps: { z0: 16, count: 8, tread: 0.4, rise: 0.15, halfWidth: 15 },
	portal: { zFront: - 5.2, zBack: - 15.2, halfWidth: 12, top: 35 },
	niche: { halfWidth: 6.5, depth: 5.6, spring: 18.2, apex: 29.2 },
	plinth: { half: 3.5, top: 8.85 },
	statueBaseOffset: 0.33,
	crownBase: 38.0,
	crownCenterZ: - 10.2
};

// pointed (two-centred) arch: circle centres at x = ±c on the springing line
const N = LAYOUT.niche;
const ARCH_H = N.apex - N.spring;
const ARCH_C = ( ARCH_H * ARCH_H - N.halfWidth * N.halfWidth ) / ( 2 * N.halfWidth );
const ARCH_R = ARCH_C + N.halfWidth;

/** Half-width of the niche opening at height y. */
export function archHalfWidth( y ) {

	if ( y <= N.spring ) return N.halfWidth;
	if ( y >= N.apex ) return 0;
	const dy = y - N.spring;
	return Math.max( 0, Math.sqrt( ARCH_R * ARCH_R - dy * dy ) - ARCH_C );

}

function shadowed( mesh, cast = true, receive = true ) {

	mesh.castShadow = cast;
	mesh.receiveShadow = receive;
	return mesh;

}

function box( w, h, d, x, y, z ) {

	return new THREE.BoxGeometry( w, h, d ).translate( x, y + h / 2, z );

}

// ------------------------------------------------------------ patterns (TSL)

/** Signed distance to the pointed-arch opening in the portal plane (negative inside). */
const archSDF = Fn( ( [ x, y ] ) => {

	const ax = abs( x );
	const inCurve = length( vec2( ax.add( ARCH_C ), y.sub( N.spring ) ) ).sub( ARCH_R );
	return select( y.lessThan( N.spring ), ax.sub( N.halfWidth ), inCurve );

} );

/**
 * Gilded ornament on the portal face: an outer frieze of pseudo-Kufic meander,
 * a cable-moulded archivolt around the opening, star rosettes in the spandrels
 * and an epigraphic panel above the apex. Returns vec2(goldMask, reliefHeight).
 */
const portalPattern = ( p, n ) => {

	const front = smoothstep( 0.6, 0.9, n.z );
	const x = p.x, y = p.y;
	const HW = LAYOUT.portal.halfWidth, TOP = LAYOUT.portal.top;

	// outer frieze band
	const dOut = min( float( HW ).sub( abs( x ) ), float( TOP ).sub( y ) );
	const inBand = smoothstep( 0.55, 0.6, dOut ).mul( smoothstep( 1.75, 1.7, dOut ) );
	const t = dOut.sub( 0.6 ).div( 1.1 );
	const s = select( float( TOP ).sub( y ).lessThan( float( HW ).sub( abs( x ) ) ), x, y );
	const meander = max(
		step( 0.32, abs( fract( s.mul( 1.25 ) ).sub( 0.5 ) ) ).mul( step( 0.22, t ) ).mul( step( t, 0.78 ) ),
		step( abs( t.sub( 0.5 ) ), 0.07 )
	).max( step( abs( t.sub( 0.5 ) ), 0.44 ).mul( step( 0.4, abs( t.sub( 0.5 ) ) ) ) );
	const frieze = inBand.mul( meander );

	// archivolt: twisted cable moulding hugging the opening
	const dA = archSDF( x, y );
	const inArch = smoothstep( 0.25, 0.3, dA ).mul( smoothstep( 1.25, 1.2, dA ) ).mul( step( 1.6, y ) );
	const cable = smoothstep( 0.2, 0.5, abs( fract( y.mul( 0.9 ).add( dA.mul( 1.4 ) ).add( abs( x ).mul( 0.35 ) ) ).sub( 0.5 ) ).mul( 2 ) );
	const archivolt = inArch.mul( cable.mul( 0.6 ).add( 0.4 ) );

	// spandrel rosettes (eight-pointed stars in interlacing rings)
	const cx = select( x.lessThan( 0 ), float( - 7.6 ), float( 7.6 ) );
	const rp = vec2( x.sub( cx ), y.sub( 30.3 ) );
	const r = length( rp );
	const th = atan( rp.y, rp.x );
	const petal = abs( cos( th.mul( 4 ) ) ).pow( 0.6 );
	const starR = mix( float( 1.1 ), float( 2.3 ), petal );
	const star = smoothstep( 0.12, 0.0, abs( r.sub( starR ) ) ).max( smoothstep( 0.1, 0.0, abs( r.sub( 2.9 ) ) ) ).max( smoothstep( 0.08, 0.0, abs( r.sub( 0.7 ) ) ) );
	const inSpandrel = step( 1.2, dA ).mul( step( y, 33.1 ) ).mul( step( N.spring, y ) ).mul( step( abs( x ), 10.2 ) );
	const rosette = star.mul( inSpandrel ).mul( step( r, 3.1 ) );

	// epigraphic panel above the apex
	const inPanel = step( abs( x ), 4.2 ).mul( step( 30.9, y ) ).mul( step( y, 32.9 ) );
	const stroke = step( 0.55, mx_noise_float( vec2( floor( x.mul( 3.2 ) ), 0.5 ) ).mul( 0.5 ).add( 0.5 ) ).mul( step( 0.2, fract( x.mul( 3.2 ) ) ) );
	const glyph = max( stroke.mul( step( y, 32.5 ) ), step( abs( y.sub( 31.2 ) ), 0.08 ) );
	const panelFrame = step( abs( x ), 4.4 ).mul( step( 30.7, y ) ).mul( step( y, 33.1 ) ).mul( inPanel.oneMinus() );
	const epigraph = inPanel.mul( glyph ).max( panelFrame );

	const gold = frieze.max( archivolt ).max( rosette ).max( epigraph ).mul( front );
	const relief = gold.mul( 1 ).add( inBand.mul( 0.4 ) ).add( inArch.mul( 0.5 ) ).mul( front );
	return vec2( gold, relief );

};

/** Gold interior of the lower niche walls: tall panels with a lattice of stars. */
const nichePattern = ( p ) => {

	const a = atan( p.x, p.z.add( 6.0 ).negate() ); // plan angle around the niche axis
	const u = a.mul( 6.2 );
	const v = p.y;
	const cellU = fract( u.div( 1.6 ) ).sub( 0.5 );
	const cellV = fract( v.div( 1.6 ) ).sub( 0.5 );
	const d = max( abs( cellU ), abs( cellV ) );
	const diag = abs( abs( cellU ).sub( abs( cellV ) ) );
	const lattice = smoothstep( 0.06, 0.0, abs( d.sub( 0.36 ) ) ).max( smoothstep( 0.05, 0.0, diag ).mul( step( d, 0.36 ) ) );
	const dado = step( v, 3.4 ); // plain stone dado at the foot of the niche
	const gold = lattice.mul( dado.oneMinus() );
	return vec2( gold, lattice.mul( 0.5 ).mul( dado.oneMinus() ) );

};

// -------------------------------------------------------------- building

export class Monument {

	constructor( { quality, assets } ) {

		this.quality = quality;
		this.assets = assets;
		this.group = new THREE.Group();
		this.group.name = 'Monument';
		this.gold = gildedBronze( { baked: false, aged: 0.6 } );

	}

	build() {

		this.buildPodium();
		this.buildPortal();
		this.buildNiche();
		this.buildPlinth();
		this.buildStars();
		return this.group;

	}

	add( geometry, material, cast = true, receive = true ) {

		const mesh = shadowed( new THREE.Mesh( geometry, material ), cast, receive );
		this.group.add( mesh );
		return mesh;

	}

	// ---------------------------------------------------------- podium

	buildPodium() {

		const L = LAYOUT, P = L.podium, T = L.podiumTop;
		const W = P.x1 - P.x0, D = P.z1 - P.z0, cx = ( P.x0 + P.x1 ) / 2, cz = ( P.z0 + P.z1 ) / 2;
		const edgeMat = greyGranite( { tint: 0x8c8884 } );
		const topMat = paving();

		const walls = [];
		walls.push( box( W, T - 0.14, D, cx, 0, cz ) );
		// capping course with a small overhang: throws a crisp shadow line
		const cap = [ box( W + 0.3, 0.14, D + 0.3, cx, T - 0.14, cz ) ];
		this.add( mergeGeometries( walls ), edgeMat );
		this.add( mergeGeometries( cap ), topMat );

		// front stair
		const S = L.steps;
		const steps = [];
		for ( let i = 0; i < S.count - 1; i ++ ) {

			const h = T - ( i + 1 ) * S.rise;
			const z = S.z0 + i * S.tread;
			steps.push( box( S.halfWidth * 2, h, S.tread + 0.02, 0, 0, z + S.tread / 2 ) );

		}

		this.add( mergeGeometries( steps ), greyGranite( { tint: 0x9a958f, slab: [ 1.0, 0.4 ] } ) );
		// cheek walls either side of the stair
		const cheeks = [];
		for ( const s of [ - 1, 1 ] ) cheeks.push( box( 1.2, T + 0.35, S.count * S.tread + 0.6, s * ( S.halfWidth + 0.6 ), 0, S.z0 + S.count * S.tread / 2 - 0.3 ) );
		this.add( mergeGeometries( cheeks ), edgeMat );

	}

	// ---------------------------------------------------------- portal

	buildPortal() {

		const L = LAYOUT, P = L.portal, T = L.podiumTop;
		const HW = P.halfWidth;
		const frontMat = travertine( { tint: 0xc2b193, pattern: portalPattern, dirtBase: T } );
		const stoneMat = travertine( { tint: 0xbfae90, dirtBase: T } );
		this.stoneMat = stoneMat;

		// portal face with the pointed opening (single contour, the notch runs to the floor)
		const shape = new THREE.Shape();
		shape.moveTo( - HW, T );
		shape.lineTo( - N.halfWidth, T );
		shape.lineTo( - N.halfWidth, N.spring );
		const steps = 48;
		for ( let i = 1; i <= steps; i ++ ) {

			const y = N.spring + ARCH_H * i / steps;
			shape.lineTo( - archHalfWidth( y ), y );

		}

		for ( let i = steps - 1; i >= 0; i -- ) {

			const y = N.spring + ARCH_H * i / steps;
			shape.lineTo( archHalfWidth( y ), y );

		}

		shape.lineTo( N.halfWidth, T );
		shape.lineTo( HW, T );
		shape.lineTo( HW, P.top );
		shape.lineTo( - HW, P.top );
		shape.closePath();
		const face = new THREE.ExtrudeGeometry( shape, { depth: 0.8, bevelEnabled: false, curveSegments: 1 } );
		face.translate( 0, 0, P.zFront - 0.8 );
		this.add( face, frontMat );

		// projecting frame band and archivolt: real relief so the portal models in raking light
		const zF = P.zFront;
		const band = [
			box( 1.15, P.top - T - 1.1, 0.28, - HW + 0.575 + 0.6, T + 1.1, zF + 0.14 ),
			box( 1.15, P.top - T - 1.1, 0.28, HW - 0.575 - 0.6, T + 1.1, zF + 0.14 ),
			box( HW * 2 - 2.4, 1.15, 0.28, 0, P.top - 1.75, zF + 0.14 )
		];
		this.add( mergeGeometries( band ), frontMat );
		const ring = new THREE.Shape();
		const outline = ( offset, reverse ) => {

			const pts = [];
			pts.push( [ - N.halfWidth - offset, T + 1.1 ], [ - N.halfWidth - offset, N.spring ] );
			const Ro = ARCH_R + offset;
			const apex = N.spring + Math.sqrt( Ro * Ro - ARCH_C * ARCH_C );
			for ( let i = 1; i <= 40; i ++ ) {

				const y = N.spring + ( apex - N.spring ) * i / 40;
				pts.push( [ - ( Math.sqrt( Math.max( 0, Ro * Ro - ( y - N.spring ) ** 2 ) ) - ARCH_C ), y ] );

			}

			for ( let i = 39; i >= 0; i -- ) {

				const y = N.spring + ( apex - N.spring ) * i / 40;
				pts.push( [ Math.sqrt( Math.max( 0, Ro * Ro - ( y - N.spring ) ** 2 ) ) - ARCH_C, y ] );

			}

			pts.push( [ N.halfWidth + offset, T + 1.1 ] );
			return reverse ? pts.reverse() : pts;

		};

		const outer = outline( 1.2, false ), inner = outline( 0.25, true );
		ring.moveTo( ...outer[ 0 ] );
		for ( const p of outer.slice( 1 ) ) ring.lineTo( ...p );
		for ( const p of inner ) ring.lineTo( ...p );
		ring.closePath();
		const archivolt = new THREE.ExtrudeGeometry( ring, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 1 } );
		archivolt.translate( 0, 0, zF );
		this.add( archivolt, frontMat );

		// block sides, back and roof (front is the portal face)
		const depth = P.zFront - 0.8 - P.zBack;
		const zc = ( P.zFront - 0.8 + P.zBack ) / 2;
		const H = P.top - T;
		const parts = [
			new THREE.PlaneGeometry( depth, H ).rotateY( - Math.PI / 2 ).translate( - HW, T + H / 2, zc ),
			new THREE.PlaneGeometry( depth, H ).rotateY( Math.PI / 2 ).translate( HW, T + H / 2, zc ),
			new THREE.PlaneGeometry( HW * 2, H ).rotateY( Math.PI ).translate( 0, T + H / 2, P.zBack )
		];
		this.add( mergeGeometries( parts ), stoneMat );

		// base course
		const baseMat = greyGranite( { tint: 0x6d6a67, rough: 0.55 } );
		const base = [
			box( HW - N.halfWidth + 0.4, 1.1, 0.5, - ( HW + N.halfWidth ) / 2 - 0.2, T, P.zFront + 0.2 ),
			box( HW - N.halfWidth + 0.4, 1.1, 0.5, ( HW + N.halfWidth ) / 2 + 0.2, T, P.zFront + 0.2 ),
			box( 0.5, 1.1, depth + 1.2, - HW - 0.2, T, zc ),
			box( 0.5, 1.1, depth + 1.2, HW + 0.2, T, zc ),
			box( HW * 2 + 0.9, 1.1, 0.5, 0, T, P.zBack - 0.2 )
		];
		this.add( mergeGeometries( base ), baseMat );

		// engaged corner columns + slender jamb colonnettes flanking the opening
		const cols = [];
		const caps = [];
		const colH = P.top - T - 1.1;
		for ( const [ x, z, r ] of [ [ - HW, P.zFront, 0.72 ], [ HW, P.zFront, 0.72 ], [ - HW, P.zBack, 0.72 ], [ HW, P.zBack, 0.72 ] ] ) {

			cols.push( new THREE.CylinderGeometry( r, r * 1.04, colH, 28 ).translate( x, T + 1.1 + colH / 2, z ) );
			caps.push( new THREE.CylinderGeometry( r * 1.3, r, 0.9, 28 ).translate( x, P.top - 0.45, z ) );
			caps.push( new THREE.CylinderGeometry( r * 1.2, r * 1.2, 0.35, 28 ).translate( x, T + 1.1 + 0.175, z ) );
			for ( let k = 1; k <= 4; k ++ ) caps.push( new THREE.CylinderGeometry( r * 1.06, r * 1.06, 0.22, 28 ).translate( x, T + 1.1 + colH * k / 5, z ) );

		}

		for ( const s of [ - 1, 1 ] ) {

			const x = s * ( N.halfWidth + 0.42 );
			const h = N.spring - T - 1.1;
			cols.push( new THREE.CylinderGeometry( 0.34, 0.36, h, 20 ).translate( x, T + 1.1 + h / 2, P.zFront + 0.1 ) );
			caps.push( new THREE.CylinderGeometry( 0.5, 0.34, 0.6, 20 ).translate( x, N.spring - 0.3, P.zFront + 0.1 ) );
			caps.push( new THREE.CylinderGeometry( 0.46, 0.46, 0.3, 20 ).translate( x, T + 1.1 + 0.15, P.zFront + 0.1 ) );

		}

		this.add( mergeGeometries( cols ), stoneMat );
		this.add( mergeGeometries( caps ), this.gold );

		// entablature: gilded frieze, cornice and roof slab
		const ent = [
			box( HW * 2 + 1.4, 0.9, 10.6 + 0.4, 0, P.top, ( P.zFront + P.zBack ) / 2 ),
			box( HW * 2 + 0.6, 0.45, 10.2, 0, P.top + 0.9, ( P.zFront + P.zBack ) / 2 )
		];
		this.add( mergeGeometries( ent ), stoneMat );
		const frieze = box( HW * 2 + 1.46, 0.28, 10.66 + 0.4, 0, P.top + 0.3, ( P.zFront + P.zBack ) / 2 );
		this.add( frieze, goldMosaic( { tile: 0.08 } ) );

		// octagonal drum carrying the crown
		const drumY = P.top + 1.35;
		const drum = new THREE.CylinderGeometry( 2.75, 3.0, LAYOUT.crownBase - drumY, 8 ).rotateY( Math.PI / 8 ).translate( 0, ( drumY + LAYOUT.crownBase ) / 2, LAYOUT.crownCenterZ );
		this.add( drum, stoneMat );
		const rings = mergeGeometries( [
			new THREE.CylinderGeometry( 3.1, 3.1, 0.22, 8 ).rotateY( Math.PI / 8 ).translate( 0, drumY + 0.11, LAYOUT.crownCenterZ ),
			new THREE.CylinderGeometry( 2.86, 2.86, 0.2, 8 ).rotateY( Math.PI / 8 ).translate( 0, LAYOUT.crownBase - 0.1, LAYOUT.crownCenterZ )
		] );
		this.add( rings, this.gold );

	}

	// ------------------------------------------------ niche + muqarnas

	buildNiche() {

		const T = LAYOUT.podiumTop;
		const zF = LAYOUT.portal.zFront - 0.8;
		const k = N.depth / N.halfWidth;

		// lower walls: half-elliptic plan, from the floor to the springing line
		const segA = 96, segY = 12;
		const lower = this.parametric( segA, segY, ( u, v ) => {

			const a = u * Math.PI;
			const y = T + v * ( N.spring - T );
			return [ - Math.cos( a ) * N.halfWidth, y, zF - Math.sin( a ) * N.halfWidth * k ];

		} );
		this.add( lower, travertine( { tint: 0xb09c78, pattern: ( p ) => nichePattern( p ), dirtBase: T } ) );

		// muqarnas half-dome: tiers of concave pointed cells, staggered and corbelled
		const tiers = 9;
		const segU = this.quality.name === 'low' ? 220 : 420;
		const segV = this.quality.name === 'low' ? 110 : 220;
		const ao = new Float32Array( ( segU + 1 ) * ( segV + 1 ) );
		const cellDepth = 0.55;
		const dome = this.parametric( segU, segV, ( u, v, idx ) => {

			const a = u * Math.PI;
			const y = N.spring + v * ARCH_H;
			const hw = archHalfWidth( y );
			const tier = Math.min( tiers - 1, Math.floor( v * tiers ) );
			const tv = v * tiers - tier;
			const cells = Math.max( 3, Math.round( 19 * ( 1 - tier / tiers ) ) | 1 );
			const cu = u * cells + ( tier % 2 ) * 0.5;
			const s = ( cu - Math.floor( cu ) ) * 2 - 1;
			// pointed-arch cell outline, deepest near its base
			const outline = 1 - Math.pow( Math.abs( s ), 1.35 );
			const inside = THREE.MathUtils.smoothstep( outline - tv, 0.0, 0.14 );
			const pocket = inside * ( 1 - tv * tv * 0.6 ) * Math.min( 1, hw * 0.7 );
			// corbelling: each tier's rim steps outwards
			const corbel = ( 1 - tv ) * 0.12 * Math.min( 1, hw * 0.5 );
			const d = pocket * cellDepth + corbel;
			ao[ idx ] = 1 - pocket * 0.55 - ( 1 - tv ) * 0.08;
			const r = hw + d;
			return [ - Math.cos( a ) * r, y + pocket * 0.12, zF - Math.sin( a ) * r * k ];

		} );
		const bake = new Float32Array( ao.length * 4 );
		for ( let i = 0; i < ao.length; i ++ ) {

			bake[ i * 4 ] = ao[ i ]; bake[ i * 4 + 1 ] = 0.5; bake[ i * 4 + 3 ] = 1;

		}

		dome.setAttribute( '_bake', new THREE.BufferAttribute( bake, 4 ) );
		this.add( dome, goldMosaic( { tile: 0.06, baked: true } ) );

		// niche floor
		const floor = new THREE.CircleGeometry( 1, 48, 0, Math.PI ).rotateX( - Math.PI / 2 ).scale( N.halfWidth, 1, N.halfWidth * k ).translate( 0, T + 0.01, zF );
		this.add( floor, greyGranite( { tint: 0x8f8a84, slab: [ 0.8, 0.8 ] } ) );

	}

	/** Grid surface p(u, v); indices wound so normals face the niche interior. */
	parametric( segU, segV, fn ) {

		const pos = new Float32Array( ( segU + 1 ) * ( segV + 1 ) * 3 );
		const uvs = new Float32Array( ( segU + 1 ) * ( segV + 1 ) * 2 );
		let i = 0;
		for ( let y = 0; y <= segV; y ++ ) {

			for ( let x = 0; x <= segU; x ++ ) {

				const p = fn( x / segU, y / segV, y * ( segU + 1 ) + x );
				pos.set( p, i * 3 );
				uvs[ i * 2 ] = x / segU; uvs[ i * 2 + 1 ] = y / segV;
				i ++;

			}

		}

		const idx = [];
		for ( let y = 0; y < segV; y ++ ) {

			for ( let x = 0; x < segU; x ++ ) {

				const a = y * ( segU + 1 ) + x, b = a + 1, c = a + segU + 1, d = c + 1;
				idx.push( a, b, c, b, d, c );

			}

		}

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
		g.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
		g.setIndex( idx );
		g.computeVertexNormals();
		return g;

	}

	// ---------------------------------------------------------- plinth

	buildPlinth() {

		const T = LAYOUT.podiumTop;
		const red = redGranite();
		const grey = greyGranite( { tint: 0x7f7b77, rough: 0.5 } );
		this.redGranite = red;

		this.add( box( 10.0, 0.45, 10.0, 0, T, 0 ), grey );
		const D = 6.0; // die width
		const reds = [
			box( 8.6, 0.45, 8.6, 0, T + 0.45, 0 ),
			box( 7.4, 0.3, 7.4, 0, T + 0.9, 0 ),
			box( 6.8, 0.2, 6.8, 0, T + 1.2, 0 ),
			box( D, 5.6, D, 0, T + 1.4, 0 ),
			box( 6.7, 0.18, 6.7, 0, T + 7.0, 0 ),
			box( 7.1, 0.3, 7.1, 0, T + 7.18, 0 ),
			box( 6.6, 0.17, 6.6, 0, T + 7.48, 0 )
		];
		this.add( mergeGeometries( reds ), red );
		// gilded fillet under the cornice and panel mouldings on each face of the die
		const fillets = [ box( D + 0.08, 0.12, D + 0.08, 0, T + 6.84, 0 ), box( D + 0.08, 0.1, D + 0.08, 0, T + 1.5, 0 ) ];
		const inset = 0.42, bar = 0.07, py0 = T + 1.95, py1 = T + 6.55, half = D / 2 - inset;
		for ( let f = 0; f < 4; f ++ ) {

			const rot = new THREE.Matrix4().makeRotationY( f * Math.PI / 2 );
			const frame = [
				new THREE.BoxGeometry( half * 2, bar, 0.05 ).translate( 0, py0, D / 2 + 0.02 ),
				new THREE.BoxGeometry( half * 2, bar, 0.05 ).translate( 0, py1, D / 2 + 0.02 ),
				new THREE.BoxGeometry( bar, py1 - py0, 0.05 ).translate( - half, ( py0 + py1 ) / 2, D / 2 + 0.02 ),
				new THREE.BoxGeometry( bar, py1 - py0, 0.05 ).translate( half, ( py0 + py1 ) / 2, D / 2 + 0.02 )
			];
			for ( const g of frame ) fillets.push( g.applyMatrix4( rot ) );

		}

		this.add( mergeGeometries( fillets ), this.gold );

		// lion plinths
		const lp = [];
		for ( const s of [ - 1, 1 ] ) lp.push( box( 3.0, 1.3, 5.4, s * 9.4, T, 0.3 ) );
		this.add( mergeGeometries( lp ), red );

		this.buildInscription( T + 4.6 );

	}

	buildInscription( y ) {

		const canvas = document.createElement( 'canvas' );
		canvas.width = 2048; canvas.height = 320;
		const ctx = canvas.getContext( '2d' );
		ctx.fillStyle = '#fff';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = '600 176px "Cormorant Garamond", "Times New Roman", "DejaVu Serif", serif';
		const text = 'ИСМОИЛИ СОМОНӢ';
		// letter-spaced capitals
		const spacing = 22;
		const chars = [ ...text ];
		const widths = chars.map( ( c ) => ctx.measureText( c ).width );
		const total = widths.reduce( ( a, b ) => a + b, 0 ) + spacing * ( chars.length - 1 );
		const scale = Math.min( 1, 1900 / total );
		ctx.save();
		ctx.translate( 1024, 165 );
		ctx.scale( scale, 1 );
		let x = - total / 2;
		chars.forEach( ( c, i ) => {

			ctx.fillText( c, x + widths[ i ] / 2, 0 );
			x += widths[ i ] + spacing;

		} );
		ctx.restore();
		const tex = new THREE.CanvasTexture( canvas );
		tex.anisotropy = 8;

		const m = gildedBronze( { baked: false, aged: 0.3, polish: 0.5 } );
		const a = texture( tex, uv() ).r;
		m.opacityNode = a;
		m.alphaTest = 0.5;
		// letters are cut in relief: bevel from the mask gradient
		m.normalNode = bumpNormal( a.mul( 0.006 ) );
		const plane = new THREE.PlaneGeometry( 4.6, 0.72 ).translate( 0, y, 3.0 + 0.006 );
		this.add( plane, m, false, true );

	}

	// ---------------------------------------------------------- stars

	buildStars() {

		const shape = new THREE.Shape();
		const R = 0.62, r = 0.26;
		for ( let i = 0; i < 10; i ++ ) {

			const a = Math.PI / 2 + i * Math.PI / 5;
			const rr = i % 2 ? r : R;
			if ( i === 0 ) shape.moveTo( Math.cos( a ) * rr, Math.sin( a ) * rr );
			else shape.lineTo( Math.cos( a ) * rr, Math.sin( a ) * rr );

		}

		shape.closePath();
		const starGeo = new THREE.ExtrudeGeometry( shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 } );
		starGeo.translate( 0, 0, - 0.06 );
		const cz = LAYOUT.crownCenterZ;
		const cy = LAYOUT.crownBase + 1.9;
		const arcR = 4.3;
		const parts = [];
		const rods = [];
		for ( let i = 0; i < 7; i ++ ) {

			const a = Math.PI * ( 0.12 + 0.76 * i / 6 );
			const x = Math.cos( a ) * arcR, y = cy + Math.sin( a ) * arcR;
			parts.push( starGeo.clone().rotateZ( a - Math.PI / 2 ).translate( x, y, cz ) );
			// slender stays back to the crown
			const from = new THREE.Vector3( Math.cos( a ) * 1.9, cy + Math.sin( a ) * 1.2, cz );
			const to = new THREE.Vector3( x, y, cz ).lerp( from, 0.12 );
			const dir = to.clone().sub( from );
			const len = dir.length();
			const q = new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), dir.normalize() );
			rods.push( new THREE.CylinderGeometry( 0.045, 0.06, len, 6 ).translate( 0, len / 2, 0 )
				.applyQuaternion( q ).translate( from.x, from.y, from.z ) );

		}

		this.add( mergeGeometries( parts ), gildedBronze( { baked: false, aged: 0.25, polish: 0.6 } ) );
		this.add( mergeGeometries( rods ), this.gold );

	}

	/** Places the sculpted GLB assets (crown, lions) once they are loaded. */
	placeSculptures( { crown, lion } ) {

		const T = LAYOUT.podiumTop;
		if ( crown ) {

			crown.position.set( 0, LAYOUT.crownBase, LAYOUT.crownCenterZ );
			this.prepareSculpture( crown, gildedBronze( { aged: 0.35 } ) );
			this.group.add( crown );

		}

		if ( lion ) {

			const mat = gildedBronze( { aged: 0.9 } );
			for ( const s of [ - 1, 1 ] ) {

				const l = s < 0 ? lion : lion.clone();
				l.position.set( s * 9.4, T + 1.3, 0.2 );
				l.rotation.y = s * - 0.06;
				this.prepareSculpture( l, mat );
				this.group.add( l );

			}

		}

	}

	prepareSculpture( obj, material ) {

		obj.traverse( ( o ) => {

			if ( ! o.isMesh ) return;
			o.material = material;
			o.castShadow = true;
			o.receiveShadow = true;

		} );

	}

}
