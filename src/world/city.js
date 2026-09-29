// Dushanbe beyond the square: residential and administrative blocks, traffic on
// Rudaki Avenue, people on the plaza, the dry foothills and the Hisor range to
// the north (placed at a reduced but parallax-free distance and hazed by the
// aerial-perspective fog so they read at their true ~25 km).

import * as THREE from 'three/webgpu';
import {
	Fn, attribute, float, vec2, vec3, color, mix, step, smoothstep, fract, floor, abs, max, min, clamp, dot, pow,
	positionWorld, normalWorld, cameraPosition, mx_noise_float, mx_fractal_noise_float, mx_cell_noise_float, normalize, reflect, pmremTexture
} from 'three/tsl';
import { CarGenerator } from 'three/addons/generators/city/CarGenerator.js';
import { PersonGenerator } from 'three/addons/generators/city/PersonGenerator.js';
import { rng } from '../core/random.js';
import { bumpNormal } from '../core/tsl-utils.js';
import { PLAZA } from './landscape.js';

// ------------------------------------------------------------ facades

function facadeMaterial( env ) {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const n = normalWorld;
	const ax = abs( n );
	const wall = step( 0.5, max( ax.x, ax.z ) );
	const along = mix( p.x, p.z, step( ax.z, ax.x ) );
	const inst = attribute( 'bInfo', 'vec4' ); // x: paint hue, y: base y, z: window style, w: seed

	const floorH = 3.1;
	const bayW = mix( float( 3.2 ), float( 2.4 ), step( 0.5, inst.z ) );
	const ly = p.y.sub( inst.y ).sub( 0.6 );
	const fy = fract( ly.div( floorH ) );
	const fx = fract( along.div( bayW ) );
	const cellId = mx_cell_noise_float( vec3( floor( along.div( bayW ) ), floor( ly.div( floorH ) ), inst.w ) );
	const winW = mix( float( 0.55 ), float( 0.7 ), step( 0.5, inst.z ) );
	const inWin = step( abs( fx.sub( 0.5 ) ), winW.mul( 0.5 ) ).mul( step( 0.3, fy ) ).mul( step( fy, 0.85 ) ).mul( step( 0.8, ly ) ).mul( wall );
	const balcony = step( 0.72, cellId ).mul( step( fy, 0.3 ) ).mul( step( abs( fx.sub( 0.5 ) ), 0.45 ) ).mul( wall ).mul( step( 2.5, ly ) );

	// pastel plaster: cream, white, ochre, pale blue — Dushanbe's palette
	const paints = [ color( 0xd9d0bd ), color( 0xe6e2d8 ), color( 0xc9ad84 ), color( 0xb9c3c4 ), color( 0xd3b9a0 ) ];
	let paint = paints[ 0 ];
	for ( let i = 1; i < paints.length; i ++ ) paint = mix( paint, paints[ i ], step( i / paints.length, inst.x ) );
	const grime = mx_noise_float( p.mul( vec3( 0.05, 0.3, 0.05 ) ) ).mul( 0.08 ).add( smoothstep( 6, 0, ly ).mul( 0.12 ) );
	let base = paint.mul( grime.oneMinus() );
	const roof = smoothstep( 0.5, 0.9, n.y );
	base = mix( base, color( 0x55524d ), roof );

	// glass: dark interiors / curtains behind glossy panes; the environment
	// lighting supplies the sky reflection with the right Fresnel falloff
	const curtain = mix( color( 0x3a3530 ), color( 0x8a7d6a ), step( 0.6, cellId ) ).mul( 0.3 );
	const col = mix( mix( base, base.mul( 0.7 ), balcony ), curtain, inWin );

	m.colorNode = col;
	m.roughnessNode = mix( float( 0.85 ), mix( float( 0.04 ), float( 0.12 ), cellId ), inWin );
	m.metalnessNode = float( 0 );
	m.normalNode = bumpNormal( inWin.mul( - 0.12 ).add( balcony.mul( 0.25 ) ).mul( wall ) );
	return m;

}

function mountainMaterial( env ) {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const n = normalWorld;
	const alt = attribute( 'alt', 'float' );
	const rockNoise = mx_fractal_noise_float( p.mul( 0.004 ), 4, 2, 0.5 );
	const slope = n.y;
	const rock = mix( color( 0x6b6155 ), color( 0x8d7f6b ), rockNoise.mul( 0.5 ).add( 0.5 ) );
	const scrub = mix( color( 0x7c7250 ), color( 0x5f6337 ), mx_noise_float( p.mul( 0.002 ) ).mul( 0.5 ).add( 0.5 ) );
	let c = mix( rock, scrub, smoothstep( 0.55, 0.85, slope ).mul( smoothstep( 0.75, 0.3, alt ) ) );
	// snow on the highest north-facing ridges (late September: first snow only)
	const snowLine = float( 0.72 ).add( rockNoise.mul( 0.08 ) );
	const snow = smoothstep( snowLine, snowLine.add( 0.05 ), alt ).mul( smoothstep( 0.35, 0.7, slope ) );
	c = mix( c, color( 0xe8ecf0 ), snow );
	m.colorNode = c;
	m.roughnessNode = mix( float( 0.95 ), float( 0.6 ), snow );
	m.metalnessNode = float( 0 );
	return m;

}

// --------------------------------------------------------------- city

export class City {

	constructor( world ) {

		this.world = world;
		this.quality = world.quality;
		this.group = new THREE.Group();
		this.group.name = 'City';
		this.R = rng( 77 );
		this.buildMountains();
		this.buildBuildings();
		this.buildTraffic();
		this.buildPeople();
		this.ready = Promise.resolve();

	}

	buildMountains() {

		const env = this.world.env;
		const mat = mountainMaterial( env );
		const ridge = ( az, rows, dist0, dist1, height, seed, sharp ) => {

			const cols = 360;
			const pos = [], alt = [], idx = [];
			const R = rng( seed );
			const off = R() * 100;
			for ( let j = 0; j <= rows; j ++ ) {

				const t = j / rows;
				const d = dist0 + ( dist1 - dist0 ) * t;
				for ( let i = 0; i <= cols; i ++ ) {

					const a = THREE.MathUtils.degToRad( az[ 0 ] + ( az[ 1 ] - az[ 0 ] ) * i / cols );
					// ridged multifractal profile
					let h = 0, amp = 1, freq = 1, w = 0;
					for ( let o = 0; o < 6; o ++ ) {

						const nv = 1 - Math.abs( Math.sin( ( a * 9 + off ) * freq + Math.sin( ( t * 3 + off ) * freq * 1.7 ) * 1.3 ) * Math.cos( ( a * 5.3 - off ) * freq * 0.7 + t * freq * 2 ) );
						h += Math.pow( nv, sharp ) * amp;
						w += amp;
						amp *= 0.5; freq *= 2.1;

					}

					h /= w;
					// back rows are the high range, front rows fall to the valley
					const envelope = Math.sin( Math.PI * Math.min( 1, t * 1.2 ) ) * ( 0.35 + 0.65 * t );
					const y = height * h * envelope - 30;
					pos.push( Math.sin( a ) * d, y, - Math.cos( a ) * d );
					alt.push( Math.max( 0, y ) / height );

				}

			}

			for ( let j = 0; j < rows; j ++ ) {

				for ( let i = 0; i < cols; i ++ ) {

					const a = j * ( cols + 1 ) + i, b = a + 1, c = a + cols + 1, d = c + 1;
					idx.push( a, c, b, b, c, d );

				}

			}

			const g = new THREE.BufferGeometry();
			g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
			g.setAttribute( 'alt', new THREE.Float32BufferAttribute( alt, 1 ) );
			g.setIndex( idx );
			g.computeVertexNormals();
			const mesh = new THREE.Mesh( g, mat );
			mesh.receiveShadow = false;
			mesh.frustumCulled = false;
			this.group.add( mesh );

		};

		// Hisor range, north (azimuth −70°…+70° around north = −Z)
		ridge( [ - 75, 75 ], 36, 5200, 8600, 1150, 3, 2.2 );
		// dry foothills (closer, lower)
		ridge( [ - 95, 95 ], 20, 2600, 3900, 330, 9, 1.4 );
		// low hills to the south and the flanks
		ridge( [ 100, 260 ], 18, 5000, 7200, 380, 21, 1.3 );

	}

	buildBuildings() {

		const R = this.R;
		const boxes = [];
		const add = ( x, z, w, d, floors, style ) => boxes.push( { x, z, w, d, h: floors * 3.1 + 1.2, style } );

		// across Rudaki Avenue: a continuous frontage of 5–9 storey blocks
		for ( let x = - 480; x < 480; ) {

			const w = 34 + R() * 50;
			if ( Math.abs( x + w / 2 ) > 30 || R() < 0.3 ) add( x + w / 2, PLAZA.sidewalks[ 1 ].z1 + 16 + R() * 8, w, 16 + R() * 6, 5 + Math.floor( R() * 5 ), R() );
			x += w + 8 + R() * 14;

		}

		// east and west of the square beyond the side streets
		for ( const side of [ - 1, 1 ] ) {

			for ( let z = - 300; z < 90; ) {

				const d = 30 + R() * 45;
				add( side * ( 104 + R() * 10 ), z + d / 2, 18 + R() * 6, d, 4 + Math.floor( R() * 6 ), R() );
				z += d + 10 + R() * 12;

			}

		}

		// deeper city blocks, lower detail
		for ( let i = 0; i < 260; i ++ ) {

			const a = R() * Math.PI * 2;
			const r = 260 + Math.pow( R(), 0.7 ) * 1400;
			const x = Math.sin( a ) * r, z = Math.cos( a ) * r;
			if ( z < - 120 && Math.abs( x ) < 150 ) continue; // keep the park clear
			const big = R() < 0.15;
			add( x, z, big ? 60 + R() * 40 : 25 + R() * 30, big ? 25 + R() * 20 : 14 + R() * 8, big ? 8 + Math.floor( R() * 8 ) : 3 + Math.floor( R() * 7 ), R() );

		}

		const n = boxes.length;
		const geo = new THREE.BoxGeometry( 1, 1, 1 ).translate( 0, 0.5, 0 );
		const info = new Float32Array( n * 4 );
		const mesh = new THREE.InstancedMesh( geo, facadeMaterial( this.world.env ), n );
		const m = new THREE.Matrix4();
		boxes.forEach( ( b, i ) => {

			// only 0°/90° rotations keep the facade grid world-aligned
			m.makeScale( b.w, b.h, b.d ).setPosition( b.x, 0, b.z );
			mesh.setMatrixAt( i, m );
			info.set( [ R(), 0, b.style, i * 1.37 ], i * 4 );

		} );
		geo.setAttribute( 'bInfo', new THREE.InstancedBufferAttribute( info, 4 ) );
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.computeBoundingSphere();
		this.group.add( mesh );

		// rooftop clutter: parapets / plant rooms
		const roofGeo = new THREE.BoxGeometry( 1, 1, 1 ).translate( 0, 0.5, 0 );
		const roofMesh = new THREE.InstancedMesh( roofGeo, new THREE.MeshStandardNodeMaterial( { color: 0x6d6a64, roughness: 0.9 } ), n );
		boxes.forEach( ( b, i ) => {

			const w = b.w * ( 0.15 + R() * 0.25 ), d = b.d * ( 0.3 + R() * 0.3 );
			m.makeScale( w, 2.4, d ).setPosition( b.x + ( R() - 0.5 ) * ( b.w - w ) * 0.8, b.h, b.z + ( R() - 0.5 ) * ( b.d - d ) * 0.8 );
			roofMesh.setMatrixAt( i, m );

		} );
		roofMesh.castShadow = true;
		roofMesh.computeBoundingSphere();
		this.group.add( roofMesh );

	}

	buildTraffic() {

		const R = this.R;
		const count = this.quality.cars;
		const palette = [ 0xf2f2f0, 0xe8e8e6, 0x1c1c1e, 0x9aa0a6, 0x5d6166, 0x7a1e1e, 0x1f3552, 0xc8c2b4, 0xf5c518 ];
		const A = PLAZA.avenue;
		// six lanes: three each way
		const lanes = [ A.z0 + 2.0, A.z0 + 5.9, A.z0 + 9.8, A.z1 - 9.8, A.z1 - 5.9, A.z1 - 2.0 ];
		this.cars = [];
		for ( let i = 0; i < count; i ++ ) {

			const lane = i % lanes.length;
			const dir = lane < 3 ? 1 : - 1;
			this.cars.push( {
				lane, dir, z: lanes[ lane ],
				x: - 500 + R() * 1000,
				speed: ( 11 + R() * 5 ) * ( 1 - ( lane % 3 ) * 0.08 ),
				color: palette[ Math.floor( R() * palette.length ) ]
			} );

		}

		this.carGen = new CarGenerator();
		const matrices = this.cars.map( ( c ) => this.carMatrix( c ) );
		this.carGroup = this.carGen.build( this.cars.map( ( c, i ) => ( { matrix: matrices[ i ], color: c.color } ) ) );
		this.group.add( this.carGroup );

		// map each car to its instanced mesh + slot (mirrors CarGenerator's bucketing)
		const slots = new Map();
		this.cars.forEach( ( car, i ) => {

			const type = car.color === CarGenerator.taxiColor ? 'taxi' : ( ( ( i * 2654435761 ) >>> 0 ) % 100 < 42 ? 'suv' : 'sedan' );
			const geo = this.carGen.geometries.get( type );
			const mesh = this.carGroup.children.find( ( c ) => c.geometry === geo );
			const k = slots.get( mesh ) || 0;
			slots.set( mesh, k + 1 );
			car.mesh = mesh;
			car.slot = k;

		} );

	}

	carMatrix( car ) {

		const m = new THREE.Matrix4();
		m.makeRotationY( car.dir > 0 ? Math.PI / 2 : - Math.PI / 2 ).setPosition( car.x, 0, car.z );
		return m;

	}

	buildPeople() {

		const R = this.R;
		const n = this.quality.people;
		const spots = [];
		const m = new THREE.Matrix4();
		for ( let i = 0; i < n; i ++ ) {

			let x, z, face;
			const r = R();
			if ( r < 0.35 ) {

				// tourists at the foot of the stair, looking up at the statue
				x = ( R() - 0.5 ) * 26; z = 21 + R() * 10; face = Math.atan2( - x, - z ) + ( R() - 0.5 ) * 0.6;

			} else if ( r < 0.7 ) {

				// strolling on the walks either side of the pool
				x = ( R() < 0.5 ? - 1 : 1 ) * ( 9 + R() * 6 ); z = 30 + R() * 70; face = R() < 0.5 ? 0 : Math.PI;

			} else {

				// along the avenue pavement
				x = ( R() - 0.5 ) * 300; z = PLAZA.sidewalks[ 0 ].z0 + 1 + R() * 2; face = R() < 0.5 ? Math.PI / 2 : - Math.PI / 2;

			}

			const s = 0.92 + R() * 0.16;
			m.compose( new THREE.Vector3( x, z > 103 ? 0.12 : 0, z ), new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), face ), new THREE.Vector3( s, s, s ) );
			spots.push( m.clone() );

		}

		const people = new PersonGenerator().build( spots );
		people.traverse( ( o ) => {

			if ( o.isMesh ) {

				o.castShadow = true;
				o.receiveShadow = true;

			}

		} );
		this.group.add( people );

	}

	update( dt ) {

		const m = new THREE.Matrix4();
		const touched = new Set();
		for ( const car of this.cars ) {

			car.x += car.dir * car.speed * dt;
			if ( car.x > 520 ) car.x = - 520;
			if ( car.x < - 520 ) car.x = 520;
			m.makeRotationY( car.dir > 0 ? Math.PI / 2 : - Math.PI / 2 ).setPosition( car.x, 0, car.z );
			car.mesh.setMatrixAt( car.slot, m );
			touched.add( car.mesh );

		}

		for ( const mesh of touched ) mesh.instanceMatrix.needsUpdate = true;

	}

}
