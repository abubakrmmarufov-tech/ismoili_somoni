// Narrow-band Surface Nets mesher for SDF sculptures, parallelised over worker threads.

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const WORKER = fileURLToPath( new URL( './worker.mjs', import.meta.url ) );

class Pool {

	constructor( modelPath, exportName, options, size ) {

		this.workers = Array.from( { length: size }, () => new Worker( WORKER, { workerData: { modelPath, exportName, options } } ) );

	}

	run( tasks ) {

		return new Promise( ( resolve, reject ) => {

			let next = 0, done = 0;
			const feed = ( w ) => {

				if ( next >= tasks.length ) return;
				const t = tasks[ next ++ ];
				w.once( 'message', () => {

					done ++;
					if ( done === tasks.length ) resolve();
					else feed( w );

				} );
				w.postMessage( t );

			};

			for ( const w of this.workers ) {

				w.once( 'error', reject );
				feed( w );

			}

			if ( tasks.length === 0 ) resolve();

		} );

	}

	close() {

		return Promise.all( this.workers.map( ( w ) => w.terminate() ) );

	}

}

/**
 * @param {object} p
 * @param {string} p.modelPath absolute path of the module exporting the model factory
 * @param {string} p.exportName name of the factory export
 * @param {number[]} p.bounds [minX, minY, minZ, maxX, maxY, maxZ]
 * @param {number} p.h voxel size
 * @param {number} p.aoDist max AO sampling distance
 */
export async function meshSDF( { modelPath, exportName, options = {}, bounds, h, aoDist, curvScale, log = console.log } ) {

	const threads = Math.max( 1, os.cpus().length );
	const pool = new Pool( modelPath, exportName, options, threads );
	const t0 = Date.now();

	const C = 8;
	const origin = [ bounds[ 0 ], bounds[ 1 ], bounds[ 2 ] ];
	const nx = Math.ceil( ( bounds[ 3 ] - bounds[ 0 ] ) / h ) + 1;
	const ny = Math.ceil( ( bounds[ 4 ] - bounds[ 1 ] ) / h ) + 1;
	const nz = Math.ceil( ( bounds[ 5 ] - bounds[ 2 ] ) / h ) + 1;
	const cdims = [ Math.ceil( ( nx - 1 ) / C ) + 2, Math.ceil( ( ny - 1 ) / C ) + 2, Math.ceil( ( nz - 1 ) / C ) + 2 ];
	log( `  grid ${nx}×${ny}×${nz} (${( nx * ny * nz / 1e6 ).toFixed( 1 )}M), coarse ${cdims.join( '×' )}` );

	// coarse pass
	const coarseBuffer = new SharedArrayBuffer( cdims[ 0 ] * cdims[ 1 ] * cdims[ 2 ] * 4 );
	const ctasks = [];
	for ( let j = 0; j < cdims[ 1 ]; j += 4 ) ctasks.push( { type: 'coarse', buffer: coarseBuffer, origin, H: h * C, dims: cdims, j0: j, j1: Math.min( cdims[ 1 ], j + 4 ) } );
	await pool.run( ctasks );

	// fine pass (narrow band)
	const gridBuffer = new SharedArrayBuffer( nx * ny * nz * 4 );
	const band = h * C * Math.sqrt( 3 ) * 1.6;
	const gtasks = [];
	for ( let j = 0; j < ny; j += 8 ) gtasks.push( { type: 'grid', buffer: gridBuffer, coarseBuffer, origin, h, C, dims: [ nx, ny, nz ], cdims, j0: j, j1: Math.min( ny, j + 8 ), band } );
	await pool.run( gtasks );
	log( `  field evaluated in ${( ( Date.now() - t0 ) / 1000 ).toFixed( 1 )}s` );

	// surface nets
	const grid = new Float32Array( gridBuffer );
	const gi = ( i, j, k ) => i + nx * ( k + nz * j );
	const cellVert = new Int32Array( ( nx - 1 ) * ( ny - 1 ) * ( nz - 1 ) ).fill( - 1 );
	const ci = ( i, j, k ) => i + ( nx - 1 ) * ( k + ( nz - 1 ) * j );
	const pos = [];
	const EDGES = [ [ 0, 1 ], [ 2, 3 ], [ 4, 5 ], [ 6, 7 ], [ 0, 2 ], [ 1, 3 ], [ 4, 6 ], [ 5, 7 ], [ 0, 4 ], [ 1, 5 ], [ 2, 6 ], [ 3, 7 ] ];
	const cv = new Float32Array( 8 );

	for ( let j = 0; j < ny - 1; j ++ ) {

		for ( let k = 0; k < nz - 1; k ++ ) {

			for ( let i = 0; i < nx - 1; i ++ ) {

				let mask = 0;
				for ( let c = 0; c < 8; c ++ ) {

					const v = grid[ gi( i + ( c & 1 ), j + ( ( c >> 2 ) & 1 ), k + ( ( c >> 1 ) & 1 ) ) ];
					cv[ c ] = v;
					if ( v < 0 ) mask |= 1 << c;

				}

				if ( mask === 0 || mask === 255 ) continue;

				let sx = 0, sy = 0, sz = 0, n = 0;
				for ( const [ a, b ] of EDGES ) {

					const va = cv[ a ], vb = cv[ b ];
					if ( ( va < 0 ) === ( vb < 0 ) ) continue;
					const t = va / ( va - vb );
					const ax = a & 1, ay = ( a >> 2 ) & 1, az = ( a >> 1 ) & 1;
					const bx = b & 1, by = ( b >> 2 ) & 1, bz = ( b >> 1 ) & 1;
					sx += ax + ( bx - ax ) * t;
					sy += ay + ( by - ay ) * t;
					sz += az + ( bz - az ) * t;
					n ++;

				}

				cellVert[ ci( i, j, k ) ] = pos.length / 3;
				pos.push( origin[ 0 ] + ( i + sx / n ) * h, origin[ 1 ] + ( j + sy / n ) * h, origin[ 2 ] + ( k + sz / n ) * h );

			}

		}

	}

	const positions = new Float32Array( pos );
	const vcount = positions.length / 3;
	const idx = [];

	const quad = ( a, b, c, d, flip ) => {

		if ( a < 0 || b < 0 || c < 0 || d < 0 ) return;
		if ( flip ) {

			const t = b; b = d; d = t;

		}

		// split along the shorter diagonal
		const dAC = dist2( positions, a, c ), dBD = dist2( positions, b, d );
		if ( dAC <= dBD ) idx.push( a, b, c, a, c, d );
		else idx.push( a, b, d, b, c, d );

	};

	for ( let j = 0; j < ny; j ++ ) {

		for ( let k = 0; k < nz; k ++ ) {

			for ( let i = 0; i < nx; i ++ ) {

				const v0 = grid[ gi( i, j, k ) ];
				const in0 = v0 < 0;
				// x edge
				if ( i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1 ) {

					const in1 = grid[ gi( i + 1, j, k ) ] < 0;
					if ( in0 !== in1 ) quad( cellVert[ ci( i, j - 1, k - 1 ) ], cellVert[ ci( i, j, k - 1 ) ], cellVert[ ci( i, j, k ) ], cellVert[ ci( i, j - 1, k ) ], ! in0 );

				}

				// y edge
				if ( j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1 ) {

					const in1 = grid[ gi( i, j + 1, k ) ] < 0;
					if ( in0 !== in1 ) quad( cellVert[ ci( i - 1, j, k - 1 ) ], cellVert[ ci( i - 1, j, k ) ], cellVert[ ci( i, j, k ) ], cellVert[ ci( i, j, k - 1 ) ], ! in0 );

				}

				// z edge
				if ( k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1 ) {

					const in1 = grid[ gi( i, j, k + 1 ) ] < 0;
					if ( in0 !== in1 ) quad( cellVert[ ci( i - 1, j - 1, k ) ], cellVert[ ci( i, j - 1, k ) ], cellVert[ ci( i, j, k ) ], cellVert[ ci( i - 1, j, k ) ], ! in0 );

				}

			}

		}

	}

	log( `  surface nets: ${vcount} verts, ${idx.length / 3} tris (${( ( Date.now() - t0 ) / 1000 ).toFixed( 1 )}s)` );

	// refine + attributes in parallel
	const posBuffer = new SharedArrayBuffer( vcount * 12 );
	new Float32Array( posBuffer ).set( positions );
	const nrmBuffer = new SharedArrayBuffer( vcount * 12 );
	const colBuffer = new SharedArrayBuffer( vcount * 16 );
	const stasks = [];
	const chunk = 20000;
	for ( let v = 0; v < vcount; v += chunk ) stasks.push( { type: 'surface', posBuffer, nrmBuffer, colBuffer, v0: v, v1: Math.min( vcount, v + chunk ), h, aoDist, curvScale: curvScale || h * 3 } );
	await pool.run( stasks );
	await pool.close();
	log( `  attributes baked (${( ( Date.now() - t0 ) / 1000 ).toFixed( 1 )}s)` );

	const indices = new Uint32Array( idx );
	const out = {
		positions: new Float32Array( posBuffer ).slice(),
		normals: new Float32Array( nrmBuffer ).slice(),
		colors: new Float32Array( colBuffer ).slice(),
		indices
	};

	fixWinding( out );
	return out;

}

function dist2( P, a, b ) {

	const dx = P[ a * 3 ] - P[ b * 3 ], dy = P[ a * 3 + 1 ] - P[ b * 3 + 1 ], dz = P[ a * 3 + 2 ] - P[ b * 3 + 2 ];
	return dx * dx + dy * dy + dz * dz;

}

/** Flip triangles whose geometric normal disagrees with the SDF gradient normal. */
function fixWinding( { positions: P, normals: N, indices: I } ) {

	let flipped = 0;
	for ( let t = 0; t < I.length; t += 3 ) {

		const a = I[ t ], b = I[ t + 1 ], c = I[ t + 2 ];
		const e1x = P[ b * 3 ] - P[ a * 3 ], e1y = P[ b * 3 + 1 ] - P[ a * 3 + 1 ], e1z = P[ b * 3 + 2 ] - P[ a * 3 + 2 ];
		const e2x = P[ c * 3 ] - P[ a * 3 ], e2y = P[ c * 3 + 1 ] - P[ a * 3 + 1 ], e2z = P[ c * 3 + 2 ] - P[ a * 3 + 2 ];
		const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
		const nx = N[ a * 3 ] + N[ b * 3 ] + N[ c * 3 ], ny = N[ a * 3 + 1 ] + N[ b * 3 + 1 ] + N[ c * 3 + 1 ], nz = N[ a * 3 + 2 ] + N[ b * 3 + 2 ] + N[ c * 3 + 2 ];
		if ( fx * nx + fy * ny + fz * nz < 0 ) {

			I[ t + 1 ] = c; I[ t + 2 ] = b;
			flipped ++;

		}

	}

	return flipped;

}
