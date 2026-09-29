// Trees of Dousti Square: chinar (oriental plane) rows, pyramidal poplars in the
// park, elms and clipped thujas. Branch skeletons come from TreeGenerator; the
// crowns are filled with leaf cards from the KTX2 foliage atlas. Every template
// is instanced, and wind is applied in the vertex shader with a per-instance
// wind direction expressed in the tree's local frame, so the park sways as one.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TreeGenerator } from 'three/addons/generators/TreeGenerator.js';
import {
	Fn, attribute, float, vec3, sin, cos, time, positionLocal, uniform, mx_noise_float, vec2, mix, smoothstep
} from 'three/tsl';
import { bark, foliageMaterial } from './materials.js';
import { rng } from '../core/random.js';
import { PLAZA } from './landscape.js';

const SPECIES = {
	plane: {
		cell: [ 0, 0 ], height: [ 17, 23 ], barkTint: 0x8a8068, planeBark: true, cardSize: [ 1.5, 2.3 ], cards: 900,
		crown: { cy: 0.62, rx: 0.42, ry: 0.36, shell: 0.5 },
		tree: { levels: 4, children: [ 6, 4, 3 ], branchAngle: [ 42, 48, 55 ], lengthRatio: 0.66, trunkClear: 0.3, upPull: 0.28, droop: 0.06, gnarl: [ 0.05, 0.14, 0.22, 0.28 ], trunkRadius: 0.5, taper: 0.6 }
	},
	poplar: {
		cell: [ 1, 0 ], height: [ 20, 27 ], barkTint: 0xa9a494, cardSize: [ 1.1, 1.6 ], cards: 750,
		crown: { cy: 0.56, rx: 0.13, ry: 0.44, shell: 0.35 },
		tree: { levels: 3, children: [ 22, 5 ], branchAngle: [ 18, 26 ], lengthRatio: 0.34, trunkClear: 0.12, upPull: 0.75, droop: 0.0, gnarl: [ 0.03, 0.08, 0.12 ], trunkRadius: 0.36, taper: 0.8 }
	},
	elm: {
		cell: [ 0, 1 ], height: [ 10, 14 ], barkTint: 0x5a4c3e, cardSize: [ 1.2, 1.8 ], cards: 600,
		crown: { cy: 0.6, rx: 0.44, ry: 0.36, shell: 0.45 },
		tree: { levels: 4, children: [ 5, 4, 3 ], branchAngle: [ 45, 50, 55 ], lengthRatio: 0.64, trunkClear: 0.35, upPull: 0.25, droop: 0.08, gnarl: [ 0.06, 0.16, 0.24, 0.3 ], trunkRadius: 0.3, taper: 0.6 }
	},
	thuja: {
		cell: [ 1, 1 ], height: [ 4.5, 6.5 ], barkTint: 0x4b3a2b, cardSize: [ 0.9, 1.3 ], cards: 520,
		crown: { cone: true, base: 0.08, rx: 0.24 },
		tree: { levels: 2, children: [ 10 ], branchAngle: [ 30 ], lengthRatio: 0.3, trunkClear: 0.05, upPull: 0.6, droop: 0.0, gnarl: [ 0.02, 0.05 ], trunkRadius: 0.14, taper: 0.8 }
	}
};

/** Leaf-card crown for a template: a volume of cards biased towards the canopy shell. */
function crownCards( spec, H, R ) {

	const { crown } = spec;
	const positions = [], normals = [], uvs = [], tints = [], index = [];
	const up = new THREE.Vector3( 0, 1, 0 );
	const q = new THREE.Quaternion();
	const tmp = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
	const count = spec.cards;
	let placed = 0, guard = 0;
	while ( placed < count && guard ++ < count * 20 ) {

		// sample inside the envelope
		let x, y, z, shellN;
		if ( crown.cone ) {

			y = H * ( crown.base + ( 1 - crown.base ) * Math.pow( R(), 0.8 ) );
			const k = 1 - ( y - H * crown.base ) / ( H * ( 1 - crown.base ) );
			const rr = H * crown.rx * Math.pow( k, 0.9 ) + 0.15;
			const a = R() * Math.PI * 2, d = Math.sqrt( R() ) * rr;
			x = Math.cos( a ) * d; z = Math.sin( a ) * d;
			c.set( 0, y, 0 );
			shellN = d / rr;

		} else {

			const u = R() * 2 - 1, a = R() * Math.PI * 2;
			const s = Math.sqrt( 1 - u * u );
			const rad = crown.shell + ( 1 - crown.shell ) * Math.cbrt( R() );
			x = s * Math.cos( a ) * rad * H * crown.rx;
			y = H * crown.cy + u * rad * H * crown.ry;
			z = s * Math.sin( a ) * rad * H * crown.rx;
			c.set( 0, H * crown.cy, 0 );
			shellN = rad;

		}

		// clumping: reject some samples in low-density pockets so the sky shows through
		const clump = Math.sin( x * 0.9 + y * 0.55 ) * Math.sin( z * 0.8 - y * 0.35 + 1.3 ) + Math.sin( x * 0.31 - z * 0.27 + y * 0.2 ) * 0.6;
		if ( clump < - 0.45 && R() < 0.8 ) continue;

		const size = spec.cardSize[ 0 ] + R() * ( spec.cardSize[ 1 ] - spec.cardSize[ 0 ] );
		// card orientation: mostly facing outwards, with random tilt
		tmp.set( x, y, z ).sub( c ).normalize();
		n.set( R() - 0.5, R() - 0.5, R() - 0.5 ).multiplyScalar( 1.2 ).add( tmp ).normalize();
		q.setFromUnitVectors( new THREE.Vector3( 0, 0, 1 ), n );
		const roll = new THREE.Quaternion().setFromAxisAngle( n, R() * Math.PI * 2 );
		q.premultiply( roll );
		t1.set( 1, 0, 0 ).applyQuaternion( q ).multiplyScalar( size / 2 );
		t2.set( 0, 1, 0 ).applyQuaternion( q ).multiplyScalar( size / 2 );
		// shading normal: blend of the spherical crown normal and the card normal
		const sn = tmp.clone().multiplyScalar( 0.75 ).add( n.clone().multiplyScalar( 0.25 ) ).normalize();
		const base = placed * 4;
		const corners = [ [ - 1, - 1, 0, 0 ], [ 1, - 1, 1, 0 ], [ 1, 1, 1, 1 ], [ - 1, 1, 0, 1 ] ];
		const tint = R();
		for ( const [ a, b, u, v ] of corners ) {

			positions.push( x + t1.x * a + t2.x * b, y + t1.y * a + t2.y * b, z + t1.z * a + t2.z * b );
			normals.push( sn.x, sn.y, sn.z );
			uvs.push( u, v );
			tints.push( tint * 0.7 + shellN * 0.3 );

		}

		index.push( base, base + 1, base + 2, base, base + 2, base + 3 );
		placed ++;

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setAttribute( 'leafTint', new THREE.Float32BufferAttribute( tints, 1 ) );
	g.setIndex( index );
	return g;

}

// NB: InstancedMesh applies the instance transform *before* positionNode, so
// positionLocal is already in the forest's frame here: the sway is added in
// world space along one wind direction for the whole park.
const WIND = new THREE.Vector2( Math.cos( 0.9 ), Math.sin( 0.9 ) );

function windNode( strength, flutter, heightRef ) {

	return Fn( () => {

		const phase = attribute( 'windDir', 'vec3' ).z;
		const w = vec3( WIND.x, WIND.y, phase );
		const p = positionLocal;
		const h = p.y.div( heightRef ).clamp( 0, 1.2 );
		const gust = mx_noise_float( vec2( time.mul( 0.13 ).add( w.z.mul( 0.05 ) ), 0.5 ) ).mul( 0.5 ).add( 0.7 );
		const sway = sin( time.mul( 0.8 ).add( w.z ) ).mul( 0.6 ).add( sin( time.mul( 1.9 ).add( w.z.mul( 1.7 ) ) ).mul( 0.25 ) ).add( 0.35 ).mul( gust );
		const bend = h.mul( h ).mul( strength ).mul( sway );
		let offset = vec3( w.x.mul( bend ), bend.mul( bend ).mul( - 0.05 ), w.y.mul( bend ) );
		if ( flutter > 0 ) {

			const f = sin( time.mul( 7.3 ).add( p.x.mul( 2.1 ) ).add( p.z.mul( 1.7 ) ).add( p.y.mul( 1.3 ) ) ).mul( sin( time.mul( 3.1 ).add( p.y ) ) );
			offset = offset.add( vec3( f, f.mul( 0.6 ), f.negate() ).mul( flutter ).mul( h ).mul( gust ) );

		}

		return p.add( offset );

	} )();

}

export class Vegetation {

	constructor( world ) {

		this.world = world;
		this.quality = world.quality;
		this.group = new THREE.Group();
		this.group.name = 'Vegetation';
		this.windAngle = 0.9; // radians, from the west-north-west (valley breeze)
		this.ready = this.build();

	}

	async build() {

		const atlas = await this.world.assets.texture( 'foliage_atlas', { weight: 0.6 } );
		atlas.generateMipmaps = true;
		const R = rng( 2024 );
		const density = this.quality.treeDensity;
		const placements = this.layout( R, density );

		for ( const [ name, spec ] of Object.entries( SPECIES ) ) {

			const list = placements[ name ];
			if ( ! list.length ) continue;
			const variants = name === 'thuja' ? 2 : 3;
			const H = ( spec.height[ 0 ] + spec.height[ 1 ] ) / 2;
			const barkMat = bark( { tint: spec.barkTint, plane: !! spec.planeBark } );
			barkMat.positionNode = windNode( 0.22, 0, H );
			const leafMat = foliageMaterial( atlas, { cell: spec.cell } );
			leafMat.positionNode = windNode( 0.22, 0.035, H );

			for ( let v = 0; v < variants; v ++ ) {

				const mine = list.filter( ( _, i ) => i % variants === v );
				if ( ! mine.length ) continue;
				const { branches, leaves } = this.template( spec, H, 100 + v * 17 + name.length, R );
				this.instance( branches, barkMat, mine, true );
				this.instance( leaves, leafMat, mine, true );

			}

		}

	}

	template( spec, H, seed, R ) {

		const t = spec.tree;
		const gen = new TreeGenerator()
			.setSeed( seed )
			.setLevels( t.levels )
			.setChildren( t.children )
			.setBranchAngle( t.branchAngle )
			.setAngleVariance( 16 )
			.setLengthRatio( t.lengthRatio )
			.setLengthVariance( 0.25 )
			.setTrunkLength( H * ( spec.crown.cone ? 0.95 : 0.55 ) )
			.setTrunkRadius( t.trunkRadius )
			.setTaper( t.taper )
			.setUpPull( t.upPull )
			.setDroop( t.droop )
			.setGnarl( t.gnarl )
			.setTrunkClear( t.trunkClear )
			.setRadialSegments( this.quality.name === 'low' ? 5 : 7 )
			.setMinRadius( 0.02 )
			.setMinLength( H * 0.06 )
			.setSectionLength( H * 0.06 )
			.setRootFlare( 0.5 );
		const mesh = gen.build();
		const branches = mesh.geometry;
		mesh.material.dispose();
		const leaves = crownCards( spec, H, R );
		return { branches, leaves };

	}

	instance( geometry, material, list, cast ) {

		const n = list.length;
		const mesh = new THREE.InstancedMesh( geometry, material, n );
		const wind = new Float32Array( n * 3 );
		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
		list.forEach( ( t, i ) => {

			q.setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), t.rot );
			s.set( t.scale, t.scale * t.stretch, t.scale );
			m.compose( p.set( t.x, t.y || 0, t.z ), q, s );
			mesh.setMatrixAt( i, m );
			// world wind direction rotated into the instance frame
			const a = this.windAngle - t.rot;
			wind[ i * 3 ] = Math.cos( a );
			wind[ i * 3 + 1 ] = Math.sin( a );
			wind[ i * 3 + 2 ] = t.phase;

		} );
		geometry.setAttribute( 'windDir', new THREE.InstancedBufferAttribute( wind, 3 ) );
		mesh.castShadow = cast;
		mesh.receiveShadow = true;
		mesh.computeBoundingSphere();
		this.group.add( mesh );
		return mesh;

	}

	layout( R, density ) {

		const out = { plane: [], poplar: [], elm: [], thuja: [] };
		const put = ( kind, x, z, scale = 1, jitter = 0.6 ) => {

			if ( R() > density && kind !== 'thuja' ) return;
			const sp = SPECIES[ kind ];
			const H = ( sp.height[ 0 ] + sp.height[ 1 ] ) / 2;
			const target = sp.height[ 0 ] + R() * ( sp.height[ 1 ] - sp.height[ 0 ] );
			out[ kind ].push( {
				x: x + ( R() - 0.5 ) * jitter, z: z + ( R() - 0.5 ) * jitter,
				rot: R() * Math.PI * 2, scale: target / H * scale, stretch: 0.92 + R() * 0.16, phase: R() * 20
			} );

		};

		const P = PLAZA;
		// chinar rows along the outer edges of the lawns
		for ( let z = 31; z <= 96; z += 10.5 ) for ( const x of [ - 36.5, 36.5 ] ) put( 'plane', x, z );
		// clipped thujas along the hedges, flanking the walk
		for ( let z = 30; z <= 95; z += 6.5 ) for ( const x of [ - 20.2, 20.2 ] ) put( 'thuja', x, z, 1, 0.1 );
		// thujas framing the podium
		for ( const x of [ - 28, - 22, 22, 28 ] ) put( 'thuja', x, 18, 1.1, 0.1 );
		// poplar rows and plane groves in the park behind the monument
		for ( let x = - 56; x <= 56; x += 7 ) {

			if ( Math.abs( x ) < 20 ) continue;
			put( 'poplar', x, - 36, 1, 1.0 );

		}

		for ( let z = - 48; z > - 118; z -= 9 ) {

			for ( const x of [ - 52, - 40, - 28, - 16, 16, 28, 40, 52 ] ) put( R() < 0.3 ? 'elm' : R() < 0.5 ? 'poplar' : 'plane', x, z, 1, 3 );

		}

		// Rudaki Avenue plane trees, both sides
		for ( let x = - 320; x <= 320; x += 11 ) {

			if ( Math.abs( x ) < 46 ) continue;
			put( 'plane', x, P.sidewalks[ 0 ].z0 + 1.6, 1.05, 1 );
			put( 'plane', x + 5, P.sidewalks[ 1 ].z1 - 2, 1.05, 1 );

		}

		// side streets
		for ( let z = - 260; z <= 100; z += 12 ) {

			for ( const x of [ - 84, - 62, 62, 84 ] ) put( R() < 0.5 ? 'elm' : 'plane', x, z, 0.95, 1 );

		}

		// side plazas beside the podium
		for ( const x of [ - 50, - 44, 44, 50 ] ) for ( let z = - 22; z <= 10; z += 8 ) put( 'elm', x, z, 1, 1.5 );
		return out;

	}

}
