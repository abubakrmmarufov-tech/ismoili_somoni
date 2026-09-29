// Progressive asset loading: Meshopt-compressed GLB LODs and KTX2 textures.

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = import.meta.env.BASE_URL || './';

export class Assets {

	constructor( renderer, onProgress = () => {} ) {

		this.onProgress = onProgress;
		this.manager = new THREE.LoadingManager();
		this.ktx2 = new KTX2Loader( this.manager ).setTranscoderPath( `${BASE}basis/` ).detectSupport( renderer );
		this.gltf = new GLTFLoader( this.manager ).setMeshoptDecoder( MeshoptDecoder ).setKTX2Loader( this.ktx2 );
		this.jobs = new Map();
		this.cache = new Map();

	}

	track( key, weight, promise ) {

		this.jobs.set( key, { weight, done: false } );
		this.report();
		return promise.then( ( v ) => {

			this.jobs.get( key ).done = true;
			this.report();
			return v;

		} );

	}

	report() {

		let total = 0, done = 0;
		for ( const j of this.jobs.values() ) {

			total += j.weight;
			if ( j.done ) done += j.weight;

		}

		this.onProgress( total ? done / total : 0 );

	}

	model( name, weight = 1 ) {

		const key = `model:${name}`;
		if ( ! this.cache.has( key ) ) {

			this.cache.set( key, this.track( key, weight, this.gltf.loadAsync( `${BASE}assets/models/${name}.glb` ).then( ( g ) => g.scene ) ) );

		}

		return this.cache.get( key );

	}

	texture( name, { srgb = true, repeat = false, weight = 0.3 } = {} ) {

		const key = `tex:${name}`;
		if ( ! this.cache.has( key ) ) {

			const p = this.ktx2.loadAsync( `${BASE}assets/textures/${name}.ktx2` ).then( ( t ) => {

				t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
				if ( repeat ) t.wrapS = t.wrapT = THREE.RepeatWrapping;
				t.anisotropy = 8;
				return t;

			} );
			this.cache.set( key, this.track( key, weight, p ) );

		}

		return this.cache.get( key );

	}

}
