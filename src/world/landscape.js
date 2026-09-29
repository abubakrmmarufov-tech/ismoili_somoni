// Ground plane zones around the monument: plaza paving, lawns with granite kerbs
// and clipped hedges, Rudaki Avenue, side streets, the park behind, far terrain,
// ornamental lamp posts and benches.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
	float, vec2, vec3, abs, fract, step, smoothstep, max, min, mix, length, positionWorld, normalWorld, mx_noise_float, mx_fractal_noise_float, color
} from 'three/tsl';
import { paving, lawn, asphalt, greyGranite, paintedMetal, lin } from './materials.js';
import { bumpNormal } from '../core/tsl-utils.js';

export const PLAZA = {
	front: { x0: - 42, x1: 42, z0: 19.2, z1: 104 },
	pool: { x0: - 8, x1: 8, z0: 34, z1: 74 },
	lawns: [ { x0: - 40, x1: - 17, z0: 27, z1: 98 }, { x0: 17, x1: 40, z0: 27, z1: 98 } ],
	avenue: { z0: 108, z1: 132 },
	sidewalks: [ { z0: 104, z1: 108 }, { z0: 132, z1: 137 } ],
	sideStreets: [ { x0: - 82, x1: - 64 }, { x0: 64, x1: 82 } ],
	park: { x0: - 62, x1: 62, z0: - 120, z1: - 30 }
};

function rectShape( r, holes = [] ) {

	const s = new THREE.Shape();
	// shapes live in XY and get rotated to XZ (y → -z), so author them mirrored in y
	s.moveTo( r.x0, - r.z0 );
	s.lineTo( r.x1, - r.z0 );
	s.lineTo( r.x1, - r.z1 );
	s.lineTo( r.x0, - r.z1 );
	s.closePath();
	for ( const h of holes ) {

		const p = new THREE.Path();
		p.moveTo( h.x0, - h.z0 );
		p.lineTo( h.x0, - h.z1 );
		p.lineTo( h.x1, - h.z1 );
		p.lineTo( h.x1, - h.z0 );
		p.closePath();
		s.holes.push( p );

	}

	return s;

}

function flat( shape, y = 0 ) {

	return new THREE.ShapeGeometry( shape, 1 ).rotateX( - Math.PI / 2 ).translate( 0, y, 0 );

}

function plane( x0, x1, z0, z1, y = 0, seg = 1 ) {

	return new THREE.PlaneGeometry( x1 - x0, z1 - z0, seg, seg ).rotateX( - Math.PI / 2 ).translate( ( x0 + x1 ) / 2, y, ( z0 + z1 ) / 2 );

}

function kerbRect( r, w = 0.18, h = 0.13, inset = 0 ) {

	const g = [];
	const { x0, x1, z0, z1 } = r;
	g.push( new THREE.BoxGeometry( x1 - x0 + w, h, w ).translate( ( x0 + x1 ) / 2, h / 2, z0 + inset ) );
	g.push( new THREE.BoxGeometry( x1 - x0 + w, h, w ).translate( ( x0 + x1 ) / 2, h / 2, z1 - inset ) );
	g.push( new THREE.BoxGeometry( w, h, z1 - z0 ).translate( x0 + inset, h / 2, ( z0 + z1 ) / 2 ) );
	g.push( new THREE.BoxGeometry( w, h, z1 - z0 ).translate( x1 - inset, h / 2, ( z0 + z1 ) / 2 ) );
	return g;

}

export class Landscape {

	constructor( world ) {

		this.world = world;
		this.quality = world.quality;
		this.group = new THREE.Group();
		this.group.name = 'Landscape';
		this.build();
		this.ready = Promise.resolve();

	}

	add( geo, mat, cast = false, receive = true ) {

		const m = new THREE.Mesh( geo, mat );
		m.castShadow = cast;
		m.receiveShadow = receive;
		this.group.add( m );
		return m;

	}

	build() {

		const P = PLAZA;

		// wetness from fountain spray, fading ~4 m around the pool
		const pool = P.pool;
		const wetNode = ( p ) => {

			const dx = max( max( float( pool.x0 ).sub( p.x ), p.x.sub( pool.x1 ) ), 0 );
			const dz = max( max( float( pool.z0 ).sub( p.z ), p.z.sub( pool.z1 ) ), 0 );
			const d = length( vec2( dx, dz ) );
			const n = mx_noise_float( vec2( p.x.mul( 0.4 ), p.z.mul( 0.4 ) ) ).mul( 1.2 );
			return smoothstep( 4.5, 0.4, d.add( n ) ).mul( step( 0.001, d ) );

		};

		const pave = paving( { wetNode } );
		// front plaza with lawns and pool cut out
		this.add( flat( rectShape( P.front, [ ...P.lawns, P.pool ] ), 0.0 ), pave );
		// around and behind the podium
		this.add( flat( rectShape( { x0: - 62, x1: 62, z0: - 30, z1: P.front.z0 } ) ), pave );
		// side strips
		this.add( flat( rectShape( { x0: - 62, x1: - 42, z0: P.front.z0, z1: P.front.z1 } ) ), pave );
		this.add( flat( rectShape( { x0: 42, x1: 62, z0: P.front.z0, z1: P.front.z1 } ) ), pave );

		// lawns (slightly raised inside granite kerbs)
		const lawnMat = lawn();
		const lawnGeo = P.lawns.map( ( l ) => plane( l.x0, l.x1, l.z0, l.z1, 0.06 ) );
		const park = P.park;
		const parkParts = [
			plane( park.x0, - 4, park.z0, park.z1, 0.02 ),
			plane( 4, park.x1, park.z0, park.z1, 0.02 )
		];
		this.add( mergeGeometries( [ ...lawnGeo, ...parkParts ] ), lawnMat );
		// park central path
		this.add( plane( - 4, 4, park.z0, park.z1, 0.0 ), pave );

		const kerbs = [];
		for ( const l of P.lawns ) kerbs.push( ...kerbRect( l, 0.2, 0.14 ) );
		kerbs.push( ...kerbRect( { x0: - 4, x1: 4, z0: park.z0, z1: park.z1 }, 0.2, 0.1 ) );
		this.add( mergeGeometries( kerbs ), greyGranite( { tint: 0x8f8b86, slab: [ 1.0, 0.2 ] } ), true );

		// clipped boxwood hedges along the walkway side of each lawn
		const hedgeParts = [];
		for ( const l of P.lawns ) {

			const x = l.x0 < 0 ? l.x1 - 0.7 : l.x0 + 0.7;
			for ( let z = l.z0 + 1.5; z < l.z1 - 2; z += 9 ) {

				hedgeParts.push( new RoundedBoxGeometry( 1.0, 0.75, 7.2, 3, 0.2 ).translate( x, 0.06 + 0.375, z + 3.6 ) );

			}

			const zEnd = l.z0 + 0.8;
			hedgeParts.push( new RoundedBoxGeometry( l.x1 - l.x0 - 3, 0.75, 1.0, 3, 0.2 ).translate( ( l.x0 + l.x1 ) / 2, 0.06 + 0.375, zEnd ) );

		}

		this.add( mergeGeometries( hedgeParts ), hedgeMaterial(), true );

		// Rudaki Avenue + side streets
		const road = asphalt( { markings: laneMarkings } );
		this.add( plane( - 900, 900, P.avenue.z0, P.avenue.z1, 0.0 ), road );
		for ( const s of P.sideStreets ) {

			this.add( plane( s.x0, s.x1, - 900, P.avenue.z0, - 0.005 ), road );
			this.add( plane( s.x0, s.x1, P.avenue.z1, 900, - 0.005 ), road );

		}

		const walk = paving();
		for ( const s of P.sidewalks ) this.add( plane( - 900, 900, s.z0, s.z1, 0.12 ), walk );
		const curbGeo = [];
		for ( const z of [ P.avenue.z0, P.avenue.z1 ] ) curbGeo.push( new THREE.BoxGeometry( 1800, 0.14, 0.25 ).translate( 0, 0.07, z ) );
		this.add( mergeGeometries( curbGeo ), greyGranite( { tint: 0x9a9690, slab: [ 1.0, 0.25 ] } ), true );

		// far ground: dry late-summer grass and dust out to the foothills
		const farGeo = new THREE.CircleGeometry( 7000, 64 ).rotateX( - Math.PI / 2 ).translate( 0, - 0.08, 0 );
		this.add( farGeo, farGroundMaterial() );

		this.buildLamps();
		this.buildBenches();

	}

	buildLamps() {

		// Dushanbe-style ornamental lamp: fluted cast-iron pole, three arms with globes
		const pts = [
			[ 0.0, 0 ], [ 0.26, 0 ], [ 0.26, 0.12 ], [ 0.2, 0.18 ], [ 0.2, 0.7 ], [ 0.13, 0.85 ], [ 0.1, 1.0 ],
			[ 0.075, 1.2 ], [ 0.07, 3.6 ], [ 0.09, 3.7 ], [ 0.06, 3.8 ], [ 0.055, 4.4 ], [ 0.085, 4.5 ], [ 0.0, 4.6 ]
		].map( ( [ r, y ] ) => new THREE.Vector2( r, y ) );
		const pole = new THREE.LatheGeometry( pts, 16 );
		const armParts = [ pole ];
		const globes = [];
		for ( let i = 0; i < 3; i ++ ) {

			const a = i * Math.PI * 2 / 3;
			const curve = new THREE.QuadraticBezierCurve3( new THREE.Vector3( 0, 4.2, 0 ), new THREE.Vector3( Math.cos( a ) * 0.55, 4.25, Math.sin( a ) * 0.55 ), new THREE.Vector3( Math.cos( a ) * 0.62, 4.62, Math.sin( a ) * 0.62 ) );
			armParts.push( new THREE.TubeGeometry( curve, 8, 0.025, 6 ) );
			armParts.push( new THREE.CylinderGeometry( 0.06, 0.04, 0.08, 10 ).translate( Math.cos( a ) * 0.62, 4.66, Math.sin( a ) * 0.62 ) );
			globes.push( new THREE.SphereGeometry( 0.2, 16, 12 ).translate( Math.cos( a ) * 0.62, 4.86, Math.sin( a ) * 0.62 ) );

		}

		globes.push( new THREE.SphereGeometry( 0.22, 16, 12 ).translate( 0, 4.85, 0 ) );
		const poleGeo = mergeGeometries( armParts.map( ( g ) => g.index ? g.toNonIndexed() : g ).map( ( g ) => {

			g.deleteAttribute( 'uv' );
			return g;

		} ) );
		const globeGeo = mergeGeometries( globes );

		const spots = [];
		for ( let z = 24; z <= 100; z += 12 ) for ( const x of [ - 10.5, 10.5 ] ) spots.push( [ x, z ] );
		for ( let x = - 54; x <= 54; x += 12 ) spots.push( [ x, 102.5 ] );
		for ( let z = - 20; z <= 12; z += 12 ) for ( const x of [ - 36, 36 ] ) spots.push( [ x, z ] );

		const n = spots.length;
		const poles = new THREE.InstancedMesh( poleGeo, paintedMetal( 0x161816, 0.4 ), n );
		const glass = new THREE.MeshPhysicalNodeMaterial( { color: 0xf1ede4, roughness: 0.25, transmission: 0, metalness: 0 } );
		glass.emissiveNode = color( 0xfff0d6 ).mul( this.world.env.uDaylight.oneMinus().mul( 2.5 ) );
		const globesMesh = new THREE.InstancedMesh( globeGeo, glass, n );
		const m = new THREE.Matrix4();
		spots.forEach( ( [ x, z ], i ) => {

			m.makeRotationY( ( i * 1.7 ) % Math.PI ).setPosition( x, 0, z );
			poles.setMatrixAt( i, m );
			globesMesh.setMatrixAt( i, m );

		} );
		poles.castShadow = true;
		poles.receiveShadow = true;
		globesMesh.castShadow = true;
		this.group.add( poles, globesMesh );

	}

	buildBenches() {

		const parts = [];
		// cast-iron ends
		for ( const x of [ - 0.8, 0.8 ] ) {

			parts.push( new THREE.BoxGeometry( 0.06, 0.45, 0.5 ).translate( x, 0.225, 0 ) );
			parts.push( new THREE.BoxGeometry( 0.06, 0.5, 0.06 ).translate( x, 0.62, - 0.26 ).rotateX( 0 ) );

		}

		const iron = mergeGeometries( parts );
		const slats = [];
		for ( let i = 0; i < 4; i ++ ) slats.push( new THREE.BoxGeometry( 1.9, 0.035, 0.1 ).translate( 0, 0.46, - 0.18 + i * 0.12 ) );
		for ( let i = 0; i < 3; i ++ ) slats.push( new THREE.BoxGeometry( 1.9, 0.09, 0.03 ).translate( 0, 0.58 + i * 0.12, - 0.27 ) );
		const wood = mergeGeometries( slats );

		const spots = [];
		for ( let z = 30; z <= 96; z += 12 ) for ( const s of [ - 1, 1 ] ) spots.push( [ s * 13.2, z + 6, s ] );
		const n = spots.length;
		const ironMesh = new THREE.InstancedMesh( iron, paintedMetal( 0x1b1d1c, 0.5 ), n );
		const woodMat = new THREE.MeshStandardNodeMaterial();
		const p = positionWorld;
		woodMat.colorNode = color( 0x6b4a2e ).mul( mx_noise_float( vec3( p.x.mul( 0.5 ), p.y.mul( 30 ), p.z.mul( 30 ) ) ).mul( 0.2 ).add( 0.9 ) );
		woodMat.roughnessNode = float( 0.7 );
		const woodMesh = new THREE.InstancedMesh( wood, woodMat, n );
		const m = new THREE.Matrix4();
		spots.forEach( ( [ x, z, s ], i ) => {

			m.makeRotationY( s > 0 ? - Math.PI / 2 : Math.PI / 2 ).setPosition( x, 0, z );
			ironMesh.setMatrixAt( i, m );
			woodMesh.setMatrixAt( i, m );

		} );
		for ( const mesh of [ ironMesh, woodMesh ] ) {

			mesh.castShadow = true;
			mesh.receiveShadow = true;
			this.group.add( mesh );

		}

	}

}

/** White lane lines, dashed separators and a zebra crossing on the plaza axis. */
function laneMarkings( p ) {

	const P = PLAZA.avenue;
	const z = p.z;
	const edges = step( abs( z.sub( P.z0 + 0.6 ) ), 0.08 ).max( step( abs( z.sub( P.z1 - 0.6 ) ), 0.08 ) );
	const centre = step( abs( z.sub( ( P.z0 + P.z1 ) / 2 - 0.15 ) ), 0.08 ).max( step( abs( z.sub( ( P.z0 + P.z1 ) / 2 + 0.15 ) ), 0.08 ) );
	const dash = step( fract( p.x.div( 9 ) ), 0.4 );
	let lanes = float( 0 );
	for ( const o of [ 3.9, 7.8, 16.2, 20.1 ] ) lanes = lanes.max( step( abs( z.sub( P.z0 + o ) ), 0.07 ).mul( dash ) );
	const zebra = step( abs( p.x ), 6 ).mul( step( 0.5, fract( p.x.div( 1.2 ) ) ) ).mul( step( P.z0 + 1.2, z ) ).mul( step( z, P.z1 - 1.2 ) );
	const wear = smoothstep( - 0.2, 0.5, mx_noise_float( p.mul( 0.9 ) ) );
	return edges.max( centre ).max( lanes ).max( zebra ).mul( wear.mul( 0.5 ).add( 0.5 ) );

}

function hedgeMaterial() {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const leaves = mx_fractal_noise_float( p.mul( 9 ), 3, 2, 0.5 );
	const clumps = mx_noise_float( p.mul( 2.2 ) );
	const base = mix( color( 0x2c4418 ), color( 0x4a6524 ), leaves.mul( 0.5 ).add( 0.5 ) );
	const inner = smoothstep( 0.6, 0.0, p.y ).mul( 0.5 );
	m.colorNode = base.mul( clumps.mul( 0.15 ).add( 1 ) ).mul( inner.oneMinus() );
	m.roughnessNode = float( 0.85 );
	m.normalNode = bumpNormal( leaves.mul( 0.035 ).add( clumps.mul( 0.02 ) ) );
	return m;

}

function farGroundMaterial() {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const big = mx_fractal_noise_float( vec3( p.xz.mul( 0.004 ), 0.0 ), 4, 2, 0.5 );
	const mid = mx_noise_float( vec3( p.xz.mul( 0.05 ), 1.0 ) );
	const dry = color( 0x8a7d52 ), green = color( 0x566a2c ), dust = color( 0x9c8b6a );
	let c = mix( green, dry, smoothstep( - 0.3, 0.4, big ) );
	c = mix( c, dust, smoothstep( 0.2, 0.6, mid ).mul( 0.3 ) );
	m.colorNode = c;
	m.roughnessNode = float( 0.95 );
	return m;

}
