// Assembles the scene and drives per-frame updates of every living system.

import * as THREE from 'three/webgpu';
import { Environment } from './environment.js';
import { Monument, LAYOUT } from './monument.js';
import { Statue } from './statue.js';

export class World {

	constructor( { renderer, quality, assets } ) {

		this.renderer = renderer;
		this.quality = quality;
		this.assets = assets;
		this.scene = new THREE.Scene();
		this.systems = [];
		this.layout = LAYOUT;

	}

	/** Builds everything procedural immediately; streams the heavy assets. */
	async build( { hours = 17.4, onStage = () => {} } = {} ) {

		const { scene, quality, assets, renderer } = this;
		this.env = new Environment( renderer, scene, quality );
		this.env.setTime( hours );

		onStage( 'Raising the monument' );
		this.monument = new Monument( { quality, assets } );
		scene.add( this.monument.build() );

		this.statue = new Statue( { assets, quality } );
		scene.add( this.statue.group );

		// ?off=birds,splats,… skips systems (debugging / profiling)
		const off = new Set( ( new URLSearchParams( location.search ).get( 'off' ) || '' ).split( ',' ) );
		const systems = {
			landscape: () => import( './landscape.js' ).then( ( m ) => new m.Landscape( this ) ),
			vegetation: () => import( './vegetation.js' ).then( ( m ) => new m.Vegetation( this ) ),
			flags: () => import( './flags.js' ).then( ( m ) => new m.Flags( this ) ),
			birds: () => import( './birds.js' ).then( ( m ) => new m.Birds( this ) ),
			water: () => import( './water.js' ).then( ( m ) => new m.Fountain( this ) ),
			city: () => import( './city.js' ).then( ( m ) => new m.City( this ) ),
			splats: () => import( './splats.js' ).then( ( m ) => new m.FlowerSplats( this ) )
		};
		const optional = await Promise.allSettled( Object.entries( systems ).filter( ( [ k ] ) => ! off.has( k ) ).map( ( [ , f ] ) => f().then( ( s ) => this.addSystem( s ) ) ) );
		for ( const r of optional ) if ( r.status === 'rejected' ) console.warn( '[world] system skipped:', r.reason );

		onStage( 'Casting the statue' );
		const [ crown, lion ] = await Promise.all( [
			assets.model( quality.name === 'high' ? 'crown_lod0' : 'crown_lod1', 1.5 ),
			assets.model( quality.name === 'low' ? 'lion_lod1' : 'lion_lod0', 1 ),
			this.statue.load()
		] );
		this.monument.placeSculptures( { crown, lion } );

		onStage( 'Lighting the square' );
		await Promise.all( this.systems.map( ( s ) => s.ready ) );
		return this;

	}

	addSystem( system ) {

		this.systems.push( system );
		if ( system.group ) this.scene.add( system.group );
		return system;

	}

	setTime( hours ) {

		this.env.setTime( hours );
		for ( const s of this.systems ) s.onTime?.( this.env );

	}

	update( dt, t, camera ) {

		this.env.update( dt, camera );
		for ( const s of this.systems ) s.update?.( dt, t, camera );

	}

}
