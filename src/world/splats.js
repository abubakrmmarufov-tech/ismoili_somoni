// Flower beds as 3D Gaussian splats: petunias, marigolds, salvia and roses over
// dense foliage mounds. Splats are generated procedurally at load time (a few
// hundred thousand anisotropic Gaussians — zero download) and rendered with
// three's native GaussianSplat. Their baked colours are relit by a uniform that
// follows the sun, so they sit correctly in any time of day.
//
// A real capture can be dropped in with ?splat=<url.spz|.splat|.ply>&splatAt=x,y,z,scale,rotY

import * as THREE from 'three/webgpu';
import { vec3, vec4, uniform, sRGBTransferEOTF } from 'three/tsl';
import { GaussianSplat } from 'three/addons/objects/GaussianSplat.js';
import { createGaussianSplatGeometry, writeCovariance } from 'three/addons/utils/GaussianSplatUtils.js';
import { rng } from '../core/random.js';
import { soil } from './materials.js';

// sRGB byte palettes
const FLOWERS = {
	petuniaRed: [ [ 196, 22, 40 ], [ 170, 14, 36 ], [ 214, 44, 60 ] ],
	petuniaPink: [ [ 214, 70, 150 ], [ 190, 50, 130 ], [ 232, 120, 180 ] ],
	white: [ [ 238, 236, 230 ], [ 226, 224, 216 ] ],
	marigold: [ [ 244, 150, 20 ], [ 236, 118, 12 ], [ 250, 184, 36 ] ],
	salvia: [ [ 190, 20, 28 ], [ 210, 34, 30 ] ],
	violet: [ [ 110, 60, 170 ], [ 90, 48, 150 ] ]
};
const LEAVES = [ [ 46, 78, 30 ], [ 58, 92, 34 ], [ 38, 66, 26 ], [ 70, 100, 40 ], [ 32, 56, 24 ] ];

/** Bed shapes (world metres): rectangles along the podium, ovals in the lawns. */
function beds() {

	const list = [];
	for ( const s of [ - 1, 1 ] ) {

		list.push( { kind: 'rect', cx: s * 24.4, cz: 17.5, hx: 7.0, hz: 1.0, scheme: [ 'petuniaRed', 'white', 'petuniaRed' ] } );
		for ( let i = 0; i < 4; i ++ ) {

			list.push( { kind: 'oval', cx: s * 28.5, cz: 38 + i * 14, hx: 1.7, hz: 4.6, scheme: i % 2 ? [ 'marigold', 'salvia', 'marigold' ] : [ 'petuniaPink', 'white', 'violet' ] } );

		}

	}

	return list;

}

function inside( b, x, z ) {

	const u = ( x - b.cx ) / b.hx, v = ( z - b.cz ) / b.hz;
	if ( b.kind === 'oval' ) return u * u + v * v;
	return Math.max( Math.abs( u ), Math.abs( v ) );

}

function generate( density, R ) {

	const centers = [], covs = [], cols = [];
	const q = new THREE.Quaternion(), e = new THREE.Euler();
	const push = ( x, y, z, sx, sy, sz, rx, ry, rz, c, a ) => {

		q.setFromEuler( e.set( rx, ry, rz ) );
		centers.push( x, y, z );
		const off = covs.length;
		covs.length += 6;
		writeCovariance( covs, off, sx, sy, sz, q.x, q.y, q.z, q.w );
		cols.push( c[ 0 ], c[ 1 ], c[ 2 ], a );

	};

	const jitter = ( c, k = 14 ) => [ c[ 0 ] + ( R() - 0.5 ) * k, c[ 1 ] + ( R() - 0.5 ) * k, c[ 2 ] + ( R() - 0.5 ) * k ].map( ( v ) => Math.max( 0, Math.min( 255, Math.round( v ) ) ) );

	for ( const b of beds() ) {

		const area = b.kind === 'oval' ? Math.PI * b.hx * b.hz : 4 * b.hx * b.hz;
		const plants = Math.round( area * 9 * density );
		for ( let p = 0; p < plants; p ++ ) {

			// plant position inside the bed (keep a soil margin)
			let x, z, d;
			do {

				x = b.cx + ( R() * 2 - 1 ) * b.hx;
				z = b.cz + ( R() * 2 - 1 ) * b.hz;
				d = inside( b, x, z );

			} while ( d > 0.9 );

			// colour band by distance from the bed centre line (border / fill / centre)
			const band = d < 0.35 ? 2 : d < 0.7 ? 1 : 0;
			const palette = FLOWERS[ b.scheme[ band ] ];
			const h = 0.16 + R() * 0.14 + ( 1 - d ) * 0.08; // mounded towards the middle
			const r = 0.16 + R() * 0.08;

			// foliage mound: flattened leaf splats
			const leaves = Math.round( 26 * density );
			for ( let i = 0; i < leaves; i ++ ) {

				const a = R() * Math.PI * 2, rr = Math.sqrt( R() ) * r;
				const y = 0.06 + R() * h * 0.85;
				push( x + Math.cos( a ) * rr, y, z + Math.sin( a ) * rr, 0.018 + R() * 0.015, 0.004, 0.012 + R() * 0.01, ( R() - 0.5 ) * 1.2, R() * 6.28, ( R() - 0.5 ) * 1.2, jitter( LEAVES[ Math.floor( R() * LEAVES.length ) ], 18 ), 220 );

			}

			// blossoms on top
			const blooms = Math.round( ( 6 + R() * 6 ) * density );
			for ( let i = 0; i < blooms; i ++ ) {

				const a = R() * Math.PI * 2, rr = Math.sqrt( R() ) * r * 0.9;
				const bx = x + Math.cos( a ) * rr, bz = z + Math.sin( a ) * rr, by = 0.06 + h * ( 0.8 + R() * 0.25 );
				const col = palette[ Math.floor( R() * palette.length ) ];
				const size = 0.014 + R() * 0.01;
				// 3–5 petals around a darker throat
				const petals = 3 + Math.floor( R() * 3 );
				for ( let k = 0; k < petals; k ++ ) {

					const pa = k / petals * Math.PI * 2 + R();
					push( bx + Math.cos( pa ) * size * 0.8, by, bz + Math.sin( pa ) * size * 0.8, size, 0.003, size * 0.7, 0, pa, 0, jitter( col, 20 ), 245 );

				}

				push( bx, by + 0.002, bz, size * 0.35, 0.004, size * 0.35, 0, 0, 0, col.map( ( c ) => c * 0.45 ), 255 );

			}

		}

	}

	return createGaussianSplatGeometry( new Float32Array( centers ), new Float32Array( covs ), new Uint8Array( cols ) );

}

export class FlowerSplats {

	constructor( world ) {

		this.world = world;
		this.quality = world.quality;
		this.group = new THREE.Group();
		this.group.name = 'FlowerBeds';
		this.tint = uniform( new THREE.Color( 1, 1, 1 ) );

		// soil under every bed (also the fallback when splats are disabled)
		const soilMat = soil();
		for ( const b of beds() ) {

			const g = b.kind === 'oval'
				? new THREE.CircleGeometry( 1, 48 ).rotateX( - Math.PI / 2 ).scale( b.hx, 1, b.hz )
				: new THREE.PlaneGeometry( b.hx * 2, b.hz * 2 ).rotateX( - Math.PI / 2 );
			const m = new THREE.Mesh( g.translate( b.cx, 0.075, b.cz ), soilMat );
			m.receiveShadow = true;
			this.group.add( m );

		}

		this.ready = this.build();

	}

	async build() {

		const q = new URLSearchParams( location.search );
		if ( q.has( 'splat' ) ) await this.loadCapture( q.get( 'splat' ), q.get( 'splatAt' ) );
		if ( ! this.quality.splats ) return;
		const density = this.quality.name === 'high' ? 1 : 0.6;
		const geometry = generate( density, rng( 99 ) );
		this.add( geometry );

	}

	add( geometry, transform ) {

		const splats = new GaussianSplat( geometry );
		const c = splats.material.colorNode;
		// splat colours are sRGB display values: linearise, then relight
		splats.material.colorNode = vec4( sRGBTransferEOTF( c.rgb ).mul( this.tint ), c.a );
		splats.renderOrder = 1;
		if ( transform ) transform( splats );
		this.group.add( splats );
		this.onTime( this.world.env );
		return splats;

	}

	async loadCapture( url, at ) {

		const ext = url.split( '?' )[ 0 ].split( '.' ).pop().toLowerCase();
		let Loader;
		if ( ext === 'spz' ) Loader = ( await import( 'three/addons/loaders/SPZLoader.js' ) ).SPZLoader;
		else if ( ext === 'ply' ) Loader = ( await import( 'three/addons/loaders/GaussianSplatPLYLoader.js' ) ).GaussianSplatPLYLoader;
		else Loader = ( await import( 'three/addons/loaders/SPLATLoader.js' ) ).SPLATLoader;
		const geometry = await new Loader().loadAsync( url );
		const [ x = 0, y = 0, z = 0, s = 1, ry = 0 ] = ( at || '' ).split( ',' ).map( Number );
		this.add( geometry, ( o ) => {

			o.position.set( x, y, z );
			o.scale.setScalar( s );
			o.rotation.y = THREE.MathUtils.degToRad( ry );

		} );

	}

	onTime( env ) {

		// approximate irradiance on horizontal petals relative to midday
		const sun = env.uSunColor.value, k = env.uSunIntensity.value * Math.max( 0, env.uSunDir.value.y );
		const sky = 0.32 + 0.25 * env.uDaylight.value;
		this.tint.value.setRGB( sky * 0.9 + sun.r * k * 1.1, sky * 0.95 + sun.g * k * 1.1, sky * 1.05 + sun.b * k * 1.1 );

	}

}
