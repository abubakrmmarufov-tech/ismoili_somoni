// The gilded statue: streams the SDF-sculpted GLB from the smallest LOD up and
// swaps in finer levels as they arrive, so the scene is usable within a second.

import * as THREE from 'three/webgpu';
import { gildedBronze } from './materials.js';
import { LAYOUT } from './monument.js';

export class Statue {

	constructor( { assets, quality } ) {

		this.assets = assets;
		this.quality = quality;
		this.group = new THREE.Group();
		this.group.name = 'Statue';
		this.group.position.set( 0, LAYOUT.plinth.top + LAYOUT.statueBaseOffset, 0 );
		this.material = gildedBronze( { aged: 1 } );
		this.current = null;
		this.level = Infinity;

	}

	/** Resolves once the first (coarse) level is visible; finer levels continue in the background. */
	async load() {

		const custom = new URLSearchParams( location.search ).get( 'statue' );
		if ( custom ) return this.loadCustom( custom );
		const finest = this.quality.statueLod;
		const levels = [ 2, 1, 0 ].filter( ( l ) => l >= finest );
		const first = this.assets.model( `statue_lod${levels[ 0 ]}`, 1 ).then( ( s ) => this.swap( s, levels[ 0 ] ) );
		const rest = levels.slice( 1 ).map( ( l, i ) => this.assets.model( `statue_lod${l}`, 2 + i * 3 ).then( ( s ) => this.swap( s, l ) ) );
		await first;
		this.ready = Promise.all( rest );
		return this.group;

	}

	/**
	 * Swaps in an external statue (e.g. a photogrammetry or image-to-3D scan):
	 * its own PBR textures are kept, it is scaled to the real 13 m and centred on the plinth.
	 */
	async loadCustom( url ) {

		const gltf = await this.assets.gltf.loadAsync( url );
		const scene = gltf.scene;
		const box = new THREE.Box3().setFromObject( scene );
		const size = box.getSize( new THREE.Vector3() );
		const s = 13 / size.y;
		scene.scale.setScalar( s );
		scene.position.set( - ( box.min.x + size.x / 2 ) * s, - box.min.y * s - LAYOUT.statueBaseOffset, - ( box.min.z + size.z / 2 ) * s );
		scene.traverse( ( o ) => {

			if ( o.isMesh ) o.castShadow = o.receiveShadow = true;

		} );
		this.group.add( scene );
		this.current = scene;
		this.level = 0;
		this.ready = Promise.resolve();
		return this.group;

	}

	swap( scene, level ) {

		if ( level > this.level ) return; // a finer level already arrived
		scene.traverse( ( o ) => {

			if ( ! o.isMesh ) return;
			o.material = this.material;
			o.castShadow = true;
			o.receiveShadow = true;

		} );
		if ( this.current ) this.group.remove( this.current );
		this.group.add( scene );
		this.current = scene;
		this.level = level;

	}

	/** World-space anchors used by the camera director. */
	anchors() {

		const y = this.group.position.y;
		const s = 5.1; // model units → metres (see tools/models/statue.mjs)
		return {
			base: new THREE.Vector3( 0, y, 0 ),
			face: new THREE.Vector3( 0, y + 1.635 * s, 0.1 * s ),
			crown: new THREE.Vector3( 0, y + 1.75 * s, 0.0 ),
			chest: new THREE.Vector3( 0, y + 1.3 * s, 0.1 * s ),
			sceptre: new THREE.Vector3( - 0.378 * s, y + 2.43 * s, 0.158 * s ),
			fist: new THREE.Vector3( - 0.372 * s, y + 1.975 * s, 0.152 * s )
		};

	}

}
