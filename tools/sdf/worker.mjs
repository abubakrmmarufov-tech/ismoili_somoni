// Worker for SDF evaluation. Each worker rebuilds the sculpture from its module
// (functions cannot be transferred) and fills a slice of a shared buffer.

import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

const { modelPath, exportName, options } = workerData;
const mod = await import( pathToFileURL( modelPath ).href );
const model = mod[ exportName ]( options || {} );
const sdf = model.sdf;
const region = model.region || null;

parentPort.on( 'message', ( msg ) => {

	if ( msg.type === 'grid' ) gridTask( msg );
	else if ( msg.type === 'coarse' ) coarseTask( msg );
	else if ( msg.type === 'surface' ) surfaceTask( msg );
	parentPort.postMessage( { done: true } );

} );

function coarseTask( { buffer, origin, H, dims, j0, j1 } ) {

	const out = new Float32Array( buffer );
	const [ cx, , cz ] = dims;
	for ( let j = j0; j < j1; j ++ ) {

		const y = origin[ 1 ] + j * H;
		for ( let k = 0; k < cz; k ++ ) {

			const z = origin[ 2 ] + k * H;
			for ( let i = 0; i < cx; i ++ ) {

				out[ i + cx * ( k + cz * j ) ] = sdf( origin[ 0 ] + i * H, y, z );

			}

		}

	}

}

function gridTask( { buffer, coarseBuffer, origin, h, C, dims, cdims, j0, j1, band } ) {

	const out = new Float32Array( buffer );
	const coarse = new Float32Array( coarseBuffer );
	const [ nx, , nz ] = dims;
	const [ cx, , cz ] = cdims;
	const cidx = ( I, J, K ) => I + cx * ( K + cz * J );

	for ( let j = j0; j < j1; j ++ ) {

		const y = origin[ 1 ] + j * h;
		const J = Math.floor( j / C );
		for ( let k = 0; k < nz; k ++ ) {

			const z = origin[ 2 ] + k * h;
			const K = Math.floor( k / C );
			for ( let i = 0; i < nx; i ++ ) {

				const I = Math.floor( i / C );
				// conservative skip using the 8 corners of the enclosing coarse cell
				let minAbs = Infinity, pos = 0, neg = 0;
				for ( let c = 0; c < 8; c ++ ) {

					const v = coarse[ cidx( I + ( c & 1 ), J + ( ( c >> 1 ) & 1 ), K + ( ( c >> 2 ) & 1 ) ) ];
					if ( v > 0 ) pos ++; else neg ++;
					const a = v < 0 ? - v : v;
					if ( a < minAbs ) minAbs = a;

				}

				const idx = i + nx * ( k + nz * j );
				if ( minAbs > band && ( pos === 8 || neg === 8 ) ) {

					out[ idx ] = pos === 8 ? band : - band;

				} else {

					out[ idx ] = sdf( origin[ 0 ] + i * h, y, z );

				}

			}

		}

	}

}

function gradient( x, y, z, e, g ) {

	g[ 0 ] = sdf( x + e, y, z ) - sdf( x - e, y, z );
	g[ 1 ] = sdf( x, y + e, z ) - sdf( x, y - e, z );
	g[ 2 ] = sdf( x, y, z + e ) - sdf( x, y, z - e );
	const l = Math.hypot( g[ 0 ], g[ 1 ], g[ 2 ] ) || 1;
	g[ 0 ] /= l; g[ 1 ] /= l; g[ 2 ] /= l;

}

function surfaceTask( { posBuffer, nrmBuffer, colBuffer, v0, v1, h, aoDist, curvScale } ) {

	const P = new Float32Array( posBuffer );
	const N = new Float32Array( nrmBuffer );
	const Cc = new Float32Array( colBuffer );
	const g = [ 0, 0, 0 ];
	const t1 = [ 0, 0, 0 ], t2 = [ 0, 0, 0 ];

	for ( let v = v0; v < v1; v ++ ) {

		let x = P[ v * 3 ], y = P[ v * 3 + 1 ], z = P[ v * 3 + 2 ];

		// Newton projection onto the zero level set
		for ( let it = 0; it < 3; it ++ ) {

			const d = sdf( x, y, z );
			if ( Math.abs( d ) < h * 0.002 ) break;
			gradient( x, y, z, h * 0.25, g );
			const step = Math.max( - h, Math.min( h, d ) );
			x -= g[ 0 ] * step; y -= g[ 1 ] * step; z -= g[ 2 ] * step;

		}

		P[ v * 3 ] = x; P[ v * 3 + 1 ] = y; P[ v * 3 + 2 ] = z;

		gradient( x, y, z, h * 0.6, g );
		const nx = g[ 0 ], ny = g[ 1 ], nz = g[ 2 ];
		N[ v * 3 ] = nx; N[ v * 3 + 1 ] = ny; N[ v * 3 + 2 ] = nz;

		// tangent frame for cone-traced ambient occlusion
		if ( Math.abs( ny ) < 0.9 ) {

			t1[ 0 ] = nz; t1[ 1 ] = 0; t1[ 2 ] = - nx;

		} else {

			t1[ 0 ] = 0; t1[ 1 ] = - nz; t1[ 2 ] = ny;

		}

		let l = Math.hypot( t1[ 0 ], t1[ 1 ], t1[ 2 ] );
		t1[ 0 ] /= l; t1[ 1 ] /= l; t1[ 2 ] /= l;
		t2[ 0 ] = ny * t1[ 2 ] - nz * t1[ 1 ];
		t2[ 1 ] = nz * t1[ 0 ] - nx * t1[ 2 ];
		t2[ 2 ] = nx * t1[ 1 ] - ny * t1[ 0 ];

		let occ = 0, wsum = 0;
		for ( let dir = 0; dir < 7; dir ++ ) {

			let dx = nx, dy = ny, dz = nz;
			if ( dir > 0 ) {

				const a = ( dir - 1 ) / 6 * Math.PI * 2;
				const ca = Math.cos( a ) * 0.8, sa = Math.sin( a ) * 0.8;
				dx = nx * 0.6 + t1[ 0 ] * ca + t2[ 0 ] * sa;
				dy = ny * 0.6 + t1[ 1 ] * ca + t2[ 1 ] * sa;
				dz = nz * 0.6 + t1[ 2 ] * ca + t2[ 2 ] * sa;

			}

			let sca = 1;
			for ( let s = 1; s <= 5; s ++ ) {

				const hr = aoDist * ( s / 5 ) * ( s / 5 ) + h * 0.5;
				const dd = sdf( x + dx * hr, y + dy * hr, z + dz * hr );
				occ += Math.max( 0, hr - dd ) / hr * sca;
				wsum += sca;
				sca *= 0.8;

			}

		}

		const ao = Math.max( 0, Math.min( 1, 1 - 1.6 * occ / wsum ) );

		// mean curvature via the Laplacian of the distance field
		const e = curvScale;
		const d0 = sdf( x, y, z );
		const lap = ( sdf( x + e, y, z ) + sdf( x - e, y, z ) + sdf( x, y + e, z ) + sdf( x, y - e, z ) + sdf( x, y, z + e ) + sdf( x, y, z - e ) - 6 * d0 ) / ( e * e );
		const curv = Math.max( 0, Math.min( 1, 0.5 + lap * e * 0.35 ) );

		Cc[ v * 4 ] = ao;
		Cc[ v * 4 + 1 ] = curv;
		Cc[ v * 4 + 2 ] = region ? region( x, y, z ) : 0;
		Cc[ v * 4 + 3 ] = 1;

	}

}
