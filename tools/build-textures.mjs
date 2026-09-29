#!/usr/bin/env node
// Rasterises the scene's authored textures in pure JS and encodes them to KTX2
// (Basis Universal): ETC1S for colour, UASTC for normal maps. Also copies the
// Basis transcoder that KTX2Loader needs at runtime into public/basis/.
//
//   node tools/build-textures.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';
import { noise3, rng } from './sdf/core.mjs';

const root = path.join( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const outDir = path.join( root, 'public', 'assets', 'textures' );
fs.mkdirSync( outDir, { recursive: true } );

// ------------------------------------------------------------------ helpers

const clamp = ( v, a = 0, b = 1 ) => Math.max( a, Math.min( b, v ) );
const smooth = ( a, b, v ) => {

	const t = clamp( ( v - a ) / ( b - a ) );
	return t * t * ( 3 - 2 * t );

};

const srgbToLin = ( c ) => ( c <= 0.04045 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 ) );
const linToSrgb = ( c ) => ( c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow( c, 1 / 2.4 ) - 0.055 );
const hex = ( h ) => [ ( ( h >> 16 ) & 255 ) / 255, ( ( h >> 8 ) & 255 ) / 255, ( h & 255 ) / 255 ];

class Canvas {

	constructor( w, h, bg = [ 0, 0, 0, 0 ] ) {

		this.w = w; this.h = h;
		// premultiplied linear RGBA
		this.data = new Float32Array( w * h * 4 );
		for ( let i = 0; i < w * h; i ++ ) {

			const a = bg[ 3 ];
			this.data[ i * 4 ] = srgbToLin( bg[ 0 ] ) * a;
			this.data[ i * 4 + 1 ] = srgbToLin( bg[ 1 ] ) * a;
			this.data[ i * 4 + 2 ] = srgbToLin( bg[ 2 ] ) * a;
			this.data[ i * 4 + 3 ] = a;

		}

	}

	/** Composite a shape given by a signed distance function (in pixels) over the canvas. */
	shape( sdf, color, bbox, opacity = 1 ) {

		const [ x0, y0, x1, y1 ] = bbox.map( Math.round );
		const lin = [ srgbToLin( color[ 0 ] ), srgbToLin( color[ 1 ] ), srgbToLin( color[ 2 ] ) ];
		for ( let y = Math.max( 0, y0 ); y < Math.min( this.h, y1 ); y ++ ) {

			for ( let x = Math.max( 0, x0 ); x < Math.min( this.w, x1 ); x ++ ) {

				const d = sdf( x + 0.5, y + 0.5 );
				const cov = clamp( 0.5 - d ) * opacity;
				if ( cov <= 0 ) continue;
				const col = typeof color[ 3 ] === 'function' ? color[ 3 ]( x + 0.5, y + 0.5, lin ) : lin;
				const i = ( y * this.w + x ) * 4;
				const D = this.data;
				D[ i ] = col[ 0 ] * cov + D[ i ] * ( 1 - cov );
				D[ i + 1 ] = col[ 1 ] * cov + D[ i + 1 ] * ( 1 - cov );
				D[ i + 2 ] = col[ 2 ] * cov + D[ i + 2 ] * ( 1 - cov );
				D[ i + 3 ] = cov + D[ i + 3 ] * ( 1 - cov );

			}

		}

	}

	/** Un-premultiplied sRGB 8-bit RGBA. Transparent texels get their colour dilated from neighbours. */
	toRGBA8( dilate = true ) {

		const { w, h } = this;
		const out = new Uint8Array( w * h * 4 );
		const col = new Float32Array( w * h * 3 );
		const has = new Uint8Array( w * h );
		for ( let i = 0; i < w * h; i ++ ) {

			const a = this.data[ i * 4 + 3 ];
			if ( a > 0.004 ) {

				for ( let c = 0; c < 3; c ++ ) col[ i * 3 + c ] = this.data[ i * 4 + c ] / a;
				has[ i ] = 1;

			}

		}

		if ( dilate ) {

			// push colours into transparent texels so mip filtering doesn't bleed black halos
			for ( let pass = 0; pass < 24; pass ++ ) {

				const next = has.slice();
				for ( let y = 0; y < h; y ++ ) {

					for ( let x = 0; x < w; x ++ ) {

						const i = y * w + x;
						if ( has[ i ] ) continue;
						let r = 0, g = 0, b = 0, n = 0;
						for ( const [ dx, dy ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {

							const xx = x + dx, yy = y + dy;
							if ( xx < 0 || yy < 0 || xx >= w || yy >= h ) continue;
							const j = yy * w + xx;
							if ( ! has[ j ] ) continue;
							r += col[ j * 3 ]; g += col[ j * 3 + 1 ]; b += col[ j * 3 + 2 ]; n ++;

						}

						if ( n ) {

							col[ i * 3 ] = r / n; col[ i * 3 + 1 ] = g / n; col[ i * 3 + 2 ] = b / n;
							next[ i ] = 1;

						}

					}

				}

				has.set( next );

			}

		}

		for ( let i = 0; i < w * h; i ++ ) {

			for ( let c = 0; c < 3; c ++ ) out[ i * 4 + c ] = Math.round( clamp( linToSrgb( col[ i * 3 + c ] ) ) * 255 );
			out[ i * 4 + 3 ] = Math.round( clamp( this.data[ i * 4 + 3 ] ) * 255 );

		}

		return out;

	}

}

// polygon helpers for SDFs in pixel space
function sdSegment( px, py, ax, ay, bx, by ) {

	const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
	const h = clamp( ( pax * bax + pay * bay ) / ( bax * bax + bay * bay ) );
	return Math.hypot( pax - bax * h, pay - bay * h );

}

function sdStar( px, py, cx, cy, R, r, rot = 0 ) {

	const x0 = px - cx, y0 = py - cy;
	const c = Math.cos( - rot ), s = Math.sin( - rot );
	let x = x0 * c - y0 * s, y = x0 * s + y0 * c;
	const an = Math.PI / 5;
	let a = Math.atan2( x, - y );
	a = ( ( a % ( 2 * an ) ) + 2 * an ) % ( 2 * an ) - an;
	const l = Math.hypot( x, y );
	x = l * Math.cos( a ); y = l * Math.abs( Math.sin( a ) );
	const ex = r * Math.cos( an ) - R, ey = r * Math.sin( an );
	const wx = x - R, wy = y;
	const t = clamp( ( wx * ex + wy * ey ) / ( ex * ex + ey * ey ) );
	const d = Math.hypot( wx - ex * t, wy - ey * t );
	return ( ex * wy - ey * wx ) > 0 ? - d : d;

}

async function writeKTX2( name, w, h, rgba, { srgb = true, normal = false, uastc = false, quality = 200 } = {} ) {

	const png = await sharp( Buffer.from( rgba ), { raw: { width: w, height: h, channels: 4 } } ).png().toBuffer();
	if ( process.env.PREVIEW ) fs.writeFileSync( path.join( outDir, name.replace( '.ktx2', '.preview.png' ) ), png );
	const imageDecoder = async ( buffer ) => {

		const { data, info } = await sharp( buffer ).ensureAlpha().raw().toBuffer( { resolveWithObject: true } );
		return { data: new Uint8Array( data ), width: info.width, height: info.height };

	};

	const ktx2 = await encodeToKTX2( new Uint8Array( png ), {
		isUASTC: uastc || normal,
		isNormalMap: normal,
		isPerceptual: srgb && ! normal,
		isSetKTX2SRGBTransferFunc: srgb && ! normal,
		qualityLevel: quality,
		compressionLevel: 2,
		needSupercompression: uastc || normal,
		enableRDO: uastc || normal,
		rdoQualityLevel: 1.5,
		generateMipmap: true,
		imageDecoder,
		enableDebug: false
	} );
	fs.writeFileSync( path.join( outDir, name ), ktx2 );
	console.log( `  ${name}  ${w}×${h}  ${( ktx2.length / 1024 ).toFixed( 0 )} KB` );

}

// ------------------------------------------------------------ Tajik flag

async function flag() {

	const W = 1024, H = 512;
	const cv = new Canvas( W, H, [ 1, 1, 1, 1 ] );
	const red = hex( 0xcc0000 ), green = hex( 0x006600 ), gold = hex( 0xf8c300 );
	cv.shape( ( x, y ) => y - H * 2 / 7, red, [ 0, 0, W, H * 2 / 7 + 2 ] );
	cv.shape( ( x, y ) => H * 5 / 7 - y, green, [ 0, H * 5 / 7 - 2, W, H ] );

	// crown — proportions after the state flag: a curved base band, a cap with
	// a central finial and two swept side arches
	const cx = W / 2, cy = H * 0.575;
	const s = H / 512;
	const crown = ( x, y ) => {

		const u = ( x - cx ) / s, v = ( y - cy ) / s;
		// base band (slightly arched)
		const bandY = 26 + 0.0012 * u * u;
		let d = Math.max( Math.abs( u ) - 62, Math.abs( v - bandY ) - 7 );
		// cap: half ellipse above the band
		const e = Math.hypot( u / 44, ( v - 16 ) / 40 ) - 1;
		d = Math.min( d, Math.max( e * 40, v - 16 ) );
		// side arches
		for ( const sgn of [ - 1, 1 ] ) {

			const au = u - sgn * 40, av = v - 4;
			const ring = Math.abs( Math.hypot( au / 1.0, av / 1.25 ) - 20 ) - 5;
			d = Math.min( d, Math.max( ring, av - 18, - sgn * ( u - sgn * 18 ) ) );

		}

		// central finial
		d = Math.min( d, Math.hypot( u, v + 34 ) - 7 );
		d = Math.min( d, Math.max( Math.abs( u ) - 2.5, Math.abs( v + 28 ) - 8 ) );
		// windows in the cap
		const win = Math.max( Math.abs( u ) - 7, Math.abs( v - 2 ) - 11 );
		d = Math.max( d, - win );
		return d * s;

	};

	cv.shape( crown, gold, [ cx - 90 * s, cy - 50 * s, cx + 90 * s, cy + 40 * s ] );

	// seven stars on an arc above the crown
	const arcR = 88 * s, acx = cx, acy = cy + 10 * s;
	for ( let i = 0; i < 7; i ++ ) {

		const a = Math.PI * ( 0.13 + 0.74 * i / 6 );
		const sx = acx - Math.cos( a ) * arcR, sy = acy - Math.sin( a ) * arcR;
		cv.shape( ( x, y ) => sdStar( x, y, sx, sy, 11.5 * s, 4.6 * s ), gold, [ sx - 14, sy - 14, sx + 14, sy + 14 ] );

	}

	const rgba = cv.toRGBA8( false );
	// woven fabric: faint thread texture baked into the albedo
	for ( let y = 0; y < H; y ++ ) {

		for ( let x = 0; x < W; x ++ ) {

			const i = ( y * W + x ) * 4;
			const weave = 1 + 0.025 * ( ( ( x & 1 ) ^ ( y & 1 ) ) ? 1 : - 1 ) + 0.02 * noise3( x * 0.05, y * 0.8, 0 );
			for ( let c = 0; c < 3; c ++ ) rgba[ i + c ] = Math.round( clamp( rgba[ i + c ] / 255 * weave ) * 255 );

		}

	}

	await writeKTX2( 'flag_tj.ktx2', W, H, rgba, { quality: 255 } );

}

// ------------------------------------------------------- water normal map

async function waterNormals() {

	const N = 512;
	const R = rng( 7 );
	const waves = [];
	for ( let i = 0; i < 48; i ++ ) {

		const k = 1 + Math.floor( Math.pow( R(), 2 ) * 22 );
		const a = R() * Math.PI * 2;
		const kx = Math.round( Math.cos( a ) * k ), ky = Math.round( Math.sin( a ) * k );
		if ( kx === 0 && ky === 0 ) continue;
		waves.push( { kx, ky, amp: 1 / Math.pow( Math.hypot( kx, ky ), 1.35 ), ph: R() * Math.PI * 2 } );

	}

	const rgba = new Uint8Array( N * N * 4 );
	const strength = 0.9;
	for ( let y = 0; y < N; y ++ ) {

		for ( let x = 0; x < N; x ++ ) {

			let dx = 0, dy = 0;
			const u = x / N, v = y / N;
			for ( const w of waves ) {

				// sharpened (trochoid-like) crests: derivative of amp*sin^p
				const t = 2 * Math.PI * ( w.kx * u + w.ky * v ) + w.ph;
				const c = Math.cos( t ) * ( 0.75 + 0.25 * Math.sin( t ) );
				dx += w.amp * c * w.kx;
				dy += w.amp * c * w.ky;

			}

			const nx = - dx * strength * 0.05, ny = - dy * strength * 0.05;
			const l = Math.hypot( nx, ny, 1 );
			const i = ( y * N + x ) * 4;
			rgba[ i ] = Math.round( ( nx / l * 0.5 + 0.5 ) * 255 );
			rgba[ i + 1 ] = Math.round( ( ny / l * 0.5 + 0.5 ) * 255 );
			rgba[ i + 2 ] = Math.round( ( 1 / l * 0.5 + 0.5 ) * 255 );
			rgba[ i + 3 ] = 255;

		}

	}

	await writeKTX2( 'water_normal.ktx2', N, N, rgba, { srgb: false, normal: true } );

}

// ------------------------------------------------------- foliage atlas

// Leaf outlines as polar radius functions r(θ) in [0, 1], θ = 0 along the midrib.
const LEAF = {
	plane: {
		// palmate with five pointed lobes (Platanus orientalis)
		aspect: 1.0,
		r: ( t ) => {

			const lobes = Math.pow( Math.abs( Math.cos( t * 2.5 ) ), 2.2 );
			const base = 1 - 0.5 * smooth( 2.5, 3.14, Math.abs( t ) );
			return ( 0.52 + 0.48 * lobes ) * base;

		}
	},
	poplar: {
		// rounded-deltoid with a short drawn tip
		aspect: 0.9,
		r: ( t ) => 0.62 + 0.38 * Math.pow( Math.max( 0, Math.cos( t ) ), 6 ) - 0.08 * Math.pow( Math.max( 0, - Math.cos( t ) ), 2 )
	},
	elm: {
		// ovate, pointed, serrated margin
		aspect: 0.55,
		r: ( t ) => ( 0.4 + 0.6 * Math.pow( ( Math.cos( t ) + 1 ) / 2, 1.4 ) ) * ( 1 + 0.04 * Math.sin( t * 30 ) )
	}
};

function drawLeaf( cv, kind, x, y, size, rot, color, R ) {

	const { r: f, aspect } = LEAF[ kind ];
	const [ r0, g0, b0 ] = color;
	const vein = 0.8 + R() * 0.1;
	const sdf = ( px, py ) => {

		const dx = px - x, dy = py - y;
		const c = Math.cos( - rot ), s = Math.sin( - rot );
		const lx = dx * c - dy * s, ly = dx * s + dy * c;
		// the petiole sits at the origin and the blade extends along +x
		const qx = lx - size * 0.5, qy = ly / aspect;
		const t = Math.atan2( qy, qx );
		const r = Math.hypot( qx, qy );
		return ( r - f( t ) * size * 0.5 ) * Math.min( 1, aspect * 1.4 );

	};

	const shade = ( px, py, lin ) => {

		const dx = px - x, dy = py - y;
		const c = Math.cos( - rot ), s = Math.sin( - rot );
		const lx = dx * c - dy * s, ly = dx * s + dy * c;
		const mid = Math.exp( - ( ly * ly ) / ( 0.6 + size * 0.004 ) );
		const side = Math.abs( Math.sin( ( lx * 0.9 - Math.abs( ly ) * 1.2 ) / size * 9 ) );
		const veins = Math.max( mid, Math.pow( side, 30 ) * 0.5 );
		const grad = 0.82 + 0.3 * ( lx / size );
		const n = 1 + 0.08 * noise3( px * 0.15, py * 0.15, rot );
		const k = grad * n * ( 1 + ( vein - 0.8 ) * veins * 2.4 );
		return [ lin[ 0 ] * k, lin[ 1 ] * k, lin[ 2 ] * k ];

	};

	const e = size * 1.2;
	cv.shape( sdf, [ r0, g0, b0, shade ], [ x - e, y - e, x + e, y + e ] );
	// petiole
	const ex = x - Math.cos( rot ) * size * 0.25, ey = y - Math.sin( rot ) * size * 0.25;
	cv.shape( ( px, py ) => sdSegment( px, py, x, y, ex, ey ) - 0.8, [ r0 * 0.6, g0 * 0.55, b0 * 0.3 ], [ Math.min( x, ex ) - 3, Math.min( y, ey ) - 3, Math.max( x, ex ) + 3, Math.max( y, ey ) + 3 ] );

}

function drawCluster( cv, ox, oy, S, kind, seed, palette ) {

	const R = rng( seed );
	const cx = ox + S / 2, cy = oy + S / 2;
	const base = kind === 'plane' ? S * 0.15 : kind === 'poplar' ? S * 0.105 : S * 0.1;
	const spread = S * 0.5 - base * 1.15; // keep every leaf inside its atlas cell
	// twigs radiating from the cluster base (bottom centre) to points in the crown
	const bx = cx, by = oy + S * 0.94;
	const tips = [];
	for ( let i = 0; i < 9; i ++ ) {

		const a = R() * Math.PI * 2, rr = Math.sqrt( R() ) * spread * 0.85;
		const tx = cx + Math.cos( a ) * rr, ty = cy - S * 0.04 + Math.sin( a ) * rr * 0.9;
		tips.push( [ tx, ty, Math.atan2( ty - by, tx - bx ) ] );
		cv.shape( ( px, py ) => sdSegment( px, py, bx, by, tx, ty ) - 1.5 * ( S / 512 ), [ 0.3, 0.24, 0.17 ], [ Math.min( bx, tx ) - 4, Math.min( by, ty ) - 4, Math.max( bx, tx ) + 4, Math.max( by, ty ) + 4 ] );

	}

	const count = kind === 'plane' ? 70 : kind === 'poplar' ? 120 : 150;
	for ( let i = 0; i < count; i ++ ) {

		// leaves hang off the twigs, filling a rounded crown
		const tw = tips[ Math.floor( R() * tips.length ) ];
		const t = 0.25 + 0.75 * Math.pow( R(), 0.5 );
		let px = bx + ( tw[ 0 ] - bx ) * t + ( R() - 0.5 ) * base;
		let py = by + ( tw[ 1 ] - by ) * t + ( R() - 0.5 ) * base;
		const dx = px - cx, dy = py - cy, dl = Math.hypot( dx, dy );
		if ( dl > spread ) {

			px = cx + dx / dl * spread; py = cy + dy / dl * spread;

		}

		const size = base * ( 0.7 + R() * 0.5 );
		// leaves point outwards from the twig with a little droop
		const rot = Math.atan2( py - by, px - bx ) + ( R() - 0.5 ) * 2.0 + 0.3;
		const col = palette[ Math.floor( R() * palette.length ) ];
		const v = 0.82 + R() * 0.32;
		drawLeaf( cv, kind, px - Math.cos( rot ) * size * 0.5, py - Math.sin( rot ) * size * 0.5, size, rot, [ col[ 0 ] * v, col[ 1 ] * v, col[ 2 ] * v ], R );

	}

}

function drawConifer( cv, ox, oy, S, seed ) {

	// flattened scale-leaf sprays (Platycladus / Thuja)
	const R = rng( seed );
	const greens = [ [ 0.2, 0.33, 0.14 ], [ 0.24, 0.37, 0.16 ], [ 0.17, 0.29, 0.12 ], [ 0.28, 0.4, 0.18 ] ];
	const branch = ( x, y, a, len, w, depth ) => {

		const ex = x + Math.cos( a ) * len, ey = y + Math.sin( a ) * len;
		const col = greens[ Math.floor( R() * greens.length ) ];
		cv.shape( ( px, py ) => {

			const d = sdSegment( px, py, x, y, ex, ey );
			// scalloped edge from overlapping scale leaves
			const t = clamp( ( ( px - x ) * ( ex - x ) + ( py - y ) * ( ey - y ) ) / ( len * len ) );
			return d - w * ( 1 - 0.6 * t ) * ( 0.85 + 0.15 * Math.sin( t * len * 0.9 ) );

		}, col, [ Math.min( x, ex ) - w - 2, Math.min( y, ey ) - w - 2, Math.max( x, ex ) + w + 2, Math.max( y, ey ) + w + 2 ] );
		if ( depth <= 0 ) return;
		const n = 5 + Math.floor( R() * 3 );
		for ( let i = 1; i <= n; i ++ ) {

			const t = i / ( n + 1 );
			const bx2 = x + ( ex - x ) * t, by2 = y + ( ey - y ) * t;
			const side = i % 2 ? 1 : - 1;
			branch( bx2, by2, a + side * ( 0.7 + R() * 0.3 ), len * ( 0.45 - t * 0.2 ), w * 0.75, depth - 1 );

		}

	};

	for ( let i = 0; i < 3; i ++ ) branch( ox + S * 0.5 + ( R() - 0.5 ) * S * 0.2, oy + S * 0.95, - Math.PI / 2 + ( i - 1 ) * 0.5, S * 0.7, S * 0.022, 2 );

}

async function foliage() {

	const S = 512, W = S * 2;
	const cv = new Canvas( W, W );
	// late-September palettes (sRGB): mostly green with the first autumn tints
	const planeGreens = [ [ 0.3, 0.42, 0.14 ], [ 0.36, 0.47, 0.16 ], [ 0.27, 0.38, 0.13 ], [ 0.46, 0.5, 0.18 ], [ 0.58, 0.52, 0.2 ] ];
	const poplarGreens = [ [ 0.33, 0.45, 0.2 ], [ 0.4, 0.5, 0.24 ], [ 0.29, 0.41, 0.19 ], [ 0.5, 0.54, 0.26 ] ];
	const elmGreens = [ [ 0.25, 0.37, 0.12 ], [ 0.3, 0.42, 0.14 ], [ 0.22, 0.33, 0.11 ], [ 0.36, 0.45, 0.15 ] ];
	drawCluster( cv, 0, 0, S, 'plane', 11, planeGreens );
	drawCluster( cv, S, 0, S, 'poplar', 23, poplarGreens );
	drawCluster( cv, 0, S, S, 'elm', 37, elmGreens );
	drawConifer( cv, S, S, S, 41 );
	await writeKTX2( 'foliage_atlas.ktx2', W, W, cv.toRGBA8( true ), { quality: 255 } );

}

// ---------------------------------------------------------------- main

console.log( '▸ textures' );
await flag();
await waterNormals();
await foliage();

const basisDir = path.join( root, 'public', 'basis' );
fs.mkdirSync( basisDir, { recursive: true } );
for ( const f of [ 'basis_transcoder.js', 'basis_transcoder.wasm' ] ) {

	fs.copyFileSync( path.join( root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis', f ), path.join( basisDir, f ) );

}

console.log( '  basis transcoder → public/basis/' );
