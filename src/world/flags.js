// National flags of Tajikistan on two tall poles flanking the stair. The cloth is
// simulated in the vertex shader: travelling waves whose amplitude grows towards
// the fly end, gust modulation and an analytic normal for correct shading.

import * as THREE from 'three/webgpu';
import {
	Fn, float, vec3, sin, cos, time, positionLocal, uv, texture, uniform, mx_noise_float, vec2, normalize, transformNormalToView, varying
} from 'three/tsl';
import { brushedSteel, gildedBronze, greyGranite } from './materials.js';

const FLAG_W = 6.4, FLAG_H = 3.2, POLE_H = 22;

export class Flags {

	constructor( world ) {

		this.world = world;
		this.group = new THREE.Group();
		this.group.name = 'Flags';
		this.windAngle = 0.9;
		this.ready = this.build();

	}

	async build() {

		const tex = await this.world.assets.texture( 'flag_tj', { weight: 0.2 } );
		const cloth = this.clothMaterial( tex );
		const clothGeo = new THREE.PlaneGeometry( FLAG_W, FLAG_H, 64, 32 ).translate( FLAG_W / 2, - FLAG_H / 2, 0 );
		const poleGeo = new THREE.CylinderGeometry( 0.07, 0.13, POLE_H, 16 ).translate( 0, POLE_H / 2, 0 );
		const finialGeo = new THREE.SphereGeometry( 0.2, 16, 12 ).translate( 0, POLE_H + 0.15, 0 );
		const baseGeo = new THREE.CylinderGeometry( 0.6, 0.75, 0.6, 24 ).translate( 0, 0.3, 0 );
		const steel = brushedSteel();
		const gold = gildedBronze( { baked: false, aged: 0.2, polish: 0.8 } );
		const granite = greyGranite( { tint: 0x77736f, rough: 0.45 } );

		for ( const [ x, z, phase ] of [ [ - 24, 21.5, 0 ], [ 24, 21.5, 2.7 ] ] ) {

			const g = new THREE.Group();
			g.position.set( x, 0, z );
			const pole = new THREE.Mesh( poleGeo, steel );
			const finial = new THREE.Mesh( finialGeo, gold );
			const base = new THREE.Mesh( baseGeo, granite );
			const flag = new THREE.Mesh( clothGeo, phase ? this.clothMaterial( tex, phase ) : cloth );
			flag.position.set( 0.12, POLE_H - 0.3, 0 );
			// stream downwind (the wind blows towards +x/+z)
			flag.rotation.y = - this.windAngle;
			for ( const m of [ pole, finial, base, flag ] ) {

				m.castShadow = true;
				m.receiveShadow = true;
				g.add( m );

			}

			this.group.add( g );

		}

	}

	clothMaterial( tex, phase = 0 ) {

		const m = new THREE.MeshSSSNodeMaterial();
		const ph = float( phase );
		const disp = ( x, y ) => {

			const u = x.div( FLAG_W );
			const t = time.add( ph );
			const gust = mx_noise_float( vec2( t.mul( 0.21 ), ph ) ).mul( 0.35 ).add( 1.0 );
			const amp = u.pow( 1.15 ).mul( 0.42 ).mul( gust );
			const w1 = sin( x.mul( 1.9 ).sub( t.mul( 6.2 ) ).add( y.mul( 0.35 ) ) );
			const w2 = sin( x.mul( 3.7 ).sub( t.mul( 9.1 ) ).sub( y.mul( 0.9 ) ).add( 1.3 ) ).mul( 0.45 );
			const w3 = sin( x.mul( 6.1 ).sub( t.mul( 13.7 ) ).add( y.mul( 1.7 ) ) ).mul( 0.18 ).mul( u );
			return amp.mul( w1.add( w2 ).add( w3 ) );

		};

		const p = positionLocal;
		const z = disp( p.x, p.y );
		// analytic slope via central differences
		const e = 0.05;
		const dzdx = disp( p.x.add( e ), p.y ).sub( disp( p.x.sub( e ), p.y ) ).div( 2 * e );
		const dzdy = disp( p.x, p.y.add( e ) ).sub( disp( p.x, p.y.sub( e ) ) ).div( 2 * e );
		const droop = p.x.div( FLAG_W ).pow( 2 ).mul( - 0.18 );
		m.positionNode = vec3( p.x.sub( p.x.div( FLAG_W ).mul( 0.25 ) ), p.y.add( droop ), z );
		const nLocal = varying( normalize( vec3( dzdx.negate(), dzdy.negate(), 1 ) ) );
		m.normalNode = transformNormalToView( nLocal );

		const map = texture( tex, uv() );
		m.colorNode = map.rgb;
		m.side = THREE.DoubleSide;
		m.roughnessNode = float( 0.78 );
		m.metalnessNode = float( 0 );
		m.thicknessColorNode = map.rgb;
		m.thicknessDistortionNode = float( 0.2 );
		m.thicknessAttenuationNode = float( 0.6 );
		m.thicknessPowerNode = float( 2.5 );
		m.thicknessScaleNode = float( 3 );
		return m;

	}

}
