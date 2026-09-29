// Pigeons circling the monument and swifts high above the square. Flight paths
// are smooth banked loops evaluated on the CPU; wing beats (with glides) are
// done in the vertex shader from a per-instance phase and flap rate.

import * as THREE from 'three/webgpu';
import { Fn, attribute, float, vec3, sin, cos, time, positionGeometry, normalGeometry, abs, smoothstep, mix, color, cross, transformNormalToView } from 'three/tsl';
import { rng } from '../core/random.js';

function birdGeometry( span, bodyLen ) {

	// body + two tapered wings; `wing` = signed spanwise weight (0 on the body)
	const pos = [], wing = [], idx = [];
	const v = ( x, y, z, w ) => {

		pos.push( x, y, z );
		wing.push( w );
		return pos.length / 3 - 1;

	};

	const L = bodyLen, W = span / 2;
	// body: a small elongated diamond
	const nose = v( 0, 0, L * 0.55, 0 ), tail = v( 0, 0.01, - L * 0.5, 0 );
	const top = v( 0, L * 0.12, 0, 0 ), bot = v( 0, - L * 0.1, 0.02, 0 );
	const l = v( - L * 0.1, 0, 0, 0 ), r = v( L * 0.1, 0, 0, 0 );
	idx.push( nose, top, r, nose, r, bot, nose, bot, l, nose, l, top, tail, r, top, tail, bot, r, tail, l, bot, tail, top, l );
	// tail fan
	const t1 = v( - L * 0.12, 0, - L * 0.75, 0 ), t2 = v( L * 0.12, 0, - L * 0.75, 0 );
	idx.push( tail, t2, t1, tail, t1, t2 );
	// wings (double sided by duplicated winding)
	for ( const s of [ - 1, 1 ] ) {

		const root0 = v( s * L * 0.08, 0.01, L * 0.18, 0 );
		const root1 = v( s * L * 0.08, 0.01, - L * 0.12, 0 );
		const mid0 = v( s * W * 0.5, 0.02, L * 0.12, s * 0.5 );
		const mid1 = v( s * W * 0.5, 0.02, - L * 0.2, s * 0.5 );
		const tip = v( s * W, 0.0, - L * 0.22, s * 1 );
		idx.push( root0, mid0, root1, root1, mid0, mid1, mid0, tip, mid1 );
		idx.push( root0, root1, mid0, root1, mid1, mid0, mid0, mid1, tip );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'wing', new THREE.Float32BufferAttribute( wing, 1 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// v rotated by unit quaternion q
const quatRotate = ( q, v ) => v.add( cross( q.xyz, cross( q.xyz, v ).add( v.mul( q.w ) ) ).mul( 2 ) );

function birdMaterial( tint ) {

	// Birds are drawn from instanced attributes (position + orientation) rather
	// than InstancedMesh, because the wing beat must act in the bird's own frame.
	const m = new THREE.MeshStandardNodeMaterial();
	const w = attribute( 'wing', 'float' );
	const info = attribute( 'birdInfo', 'vec3' ); // phase, flap rate, glide
	const bPos = attribute( 'bPos', 'vec3' );
	const bQuat = attribute( 'bQuat', 'vec4' );
	const t = time.mul( info.y ).add( info.x );
	// flap with occasional glides
	const glide = smoothstep( 0.55, 0.9, sin( time.mul( 0.35 ).add( info.x.mul( 3.1 ) ) ) ).mul( info.z );
	const angle = sin( t ).mul( 0.95 ).mul( glide.oneMinus() ).add( glide.mul( 0.08 ) );
	const p = positionGeometry;
	const reach = abs( p.x );
	const bend = abs( w ); // outer wing flexes more
	const local = vec3( p.x.mul( cos( angle.mul( bend.add( 0.4 ) ) ) ), p.y.add( reach.mul( sin( angle ) ).mul( bend.mul( 0.4 ).add( 0.6 ) ) ), p.z );
	m.positionNode = bPos.add( quatRotate( bQuat, local ) );
	m.normalNode = transformNormalToView( quatRotate( bQuat, normalGeometry ) );
	m.colorNode = mix( color( tint[ 0 ] ), color( tint[ 1 ] ), abs( w ) );
	m.roughnessNode = float( 0.8 );
	m.side = THREE.DoubleSide;
	return m;

}

export class Birds {

	constructor( world ) {

		this.world = world;
		this.group = new THREE.Group();
		this.group.name = 'Birds';
		const n = world.quality.birds;
		const R = rng( 5 );
		this.flocks = [];

		// pigeons: loops around the portal and crown
		this.flocks.push( this.makeFlock( Math.round( n * 0.65 ), R, {
			geo: birdGeometry( 0.66, 0.34 ), tint: [ 0x77787c, 0x5a5b60 ], rate: [ 9, 12 ], glide: 0.6,
			path: ( b, t ) => {

				const a = b.a0 + t * b.w;
				const r = b.r + Math.sin( t * 0.23 + b.p ) * 4;
				return [ Math.sin( a ) * r + b.cx, b.h + Math.sin( t * 0.41 + b.p ) * 3 + Math.sin( a * 2 ) * 2, Math.cos( a ) * r * 0.8 + b.cz ];

			},
			init: ( b, R ) => Object.assign( b, { a0: R() * 6.28, w: ( 0.18 + R() * 0.08 ) * ( R() < 0.8 ? 1 : - 1 ), r: 16 + R() * 18, h: 24 + R() * 20, p: R() * 6.28, cx: ( R() - 0.5 ) * 6, cz: - 4 + ( R() - 0.5 ) * 10 } )
		} ) );

		// swifts: fast, high, erratic arcs over the square
		this.flocks.push( this.makeFlock( Math.max( 4, Math.round( n * 0.35 ) ), R, {
			geo: birdGeometry( 0.42, 0.17 ), tint: [ 0x26272b, 0x1b1c1f ], rate: [ 15, 20 ], glide: 0.9,
			path: ( b, t ) => {

				const a = b.a0 + t * b.w;
				return [ Math.sin( a ) * b.r + Math.sin( t * 1.3 + b.p ) * 12 + b.cx, b.h + Math.sin( t * 0.9 + b.p ) * 10, Math.cos( a * 1.3 ) * b.r * 0.7 + b.cz ];

			},
			init: ( b, R ) => Object.assign( b, { a0: R() * 6.28, w: 0.35 + R() * 0.25, r: 40 + R() * 60, h: 60 + R() * 50, p: R() * 6.28, cx: ( R() - 0.5 ) * 60, cz: 30 + ( R() - 0.5 ) * 80 } )
		} ) );

		this.ready = Promise.resolve();

	}

	makeFlock( count, R, spec ) {

		const info = new Float32Array( count * 3 );
		const birds = [];
		for ( let i = 0; i < count; i ++ ) {

			const b = spec.init( {}, R );
			birds.push( b );
			info.set( [ R() * 50, spec.rate[ 0 ] + R() * ( spec.rate[ 1 ] - spec.rate[ 0 ] ), spec.glide ], i * 3 );

		}

		const src = spec.geo;
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = src.index;
		for ( const k of [ 'position', 'normal', 'wing' ] ) geo.setAttribute( k, src.getAttribute( k ) );
		geo.instanceCount = count;
		geo.setAttribute( 'birdInfo', new THREE.InstancedBufferAttribute( info, 3 ) );
		const pos = new THREE.InstancedBufferAttribute( new Float32Array( count * 3 ), 3 ).setUsage( THREE.DynamicDrawUsage );
		const quat = new THREE.InstancedBufferAttribute( new Float32Array( count * 4 ), 4 ).setUsage( THREE.DynamicDrawUsage );
		geo.setAttribute( 'bPos', pos );
		geo.setAttribute( 'bQuat', quat );
		const mesh = new THREE.Mesh( geo, birdMaterial( spec.tint ) );
		mesh.castShadow = true;
		mesh.frustumCulled = false;
		this.group.add( mesh );
		return { mesh, birds, spec, pos, quat };

	}

	update( dt, t ) {

		const m = new THREE.Matrix4(), q = new THREE.Quaternion();
		const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3( 0, 1, 0 );
		const e = new THREE.Euler();
		for ( const f of this.flocks ) {

			f.birds.forEach( ( b, i ) => {

				p0.fromArray( f.spec.path( b, t ) );
				p1.fromArray( f.spec.path( b, t + 0.1 ) );
				p2.fromArray( f.spec.path( b, t + 0.2 ) );
				fwd.subVectors( p1, p0 ).normalize();
				// bank into the turn
				const turn = new THREE.Vector3().subVectors( p2, p1 ).normalize().cross( fwd ).y;
				m.lookAt( p0, p1, up );
				q.setFromRotationMatrix( m );
				// lookAt points -Z at the target; the bird model faces +Z
				q.multiply( new THREE.Quaternion().setFromEuler( e.set( 0, Math.PI, THREE.MathUtils.clamp( - turn * 25, - 0.9, 0.9 ) ) ) );
				f.pos.setXYZ( i, p0.x, p0.y, p0.z );
				f.quat.setXYZW( i, q.x, q.y, q.z, q.w );

			} );
			f.pos.needsUpdate = true;
			f.quat.needsUpdate = true;

		}

	}

}
