// Solar position for Dushanbe (NOAA low-precision algorithm, ~0.1° accuracy).
// World convention: north = -Z, east = +X, up = +Y. The statue faces south (+Z).

import { Vector3, Color, MathUtils } from 'three/webgpu';

export const DUSHANBE = { lat: 38.5767, lon: 68.7798, utcOffset: 5 };

const rad = MathUtils.DEG2RAD;

/**
 * @param {number} hours local solar-clock hours (e.g. 17.5 = 17:30 Dushanbe time)
 * @param {Date} [day] calendar day
 * @returns {{azimuth:number, elevation:number, direction:Vector3}} degrees; direction points at the sun
 */
export function sunAt( hours, day = new Date( Date.UTC( 2026, 8, 29 ) ) ) {

	const utcMs = Date.UTC( day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() ) + ( hours - DUSHANBE.utcOffset ) * 3600e3;
	const n = utcMs / 86400000 + 2440587.5 - 2451545.0;
	const L = ( 280.46 + 0.9856474 * n ) % 360;
	const g = ( ( 357.528 + 0.9856003 * n ) % 360 ) * rad;
	const lambda = ( L + 1.915 * Math.sin( g ) + 0.02 * Math.sin( 2 * g ) ) * rad;
	const eps = ( 23.439 - 0.0000004 * n ) * rad;
	const ra = Math.atan2( Math.cos( eps ) * Math.sin( lambda ), Math.cos( lambda ) );
	const dec = Math.asin( Math.sin( eps ) * Math.sin( lambda ) );
	const gmst = ( 18.697374558 + 24.06570982441908 * n ) % 24;
	const lst = gmst + DUSHANBE.lon / 15;
	const H = ( lst * 15 ) * rad - ra;
	const phi = DUSHANBE.lat * rad;
	const el = Math.asin( Math.sin( phi ) * Math.sin( dec ) + Math.cos( phi ) * Math.cos( dec ) * Math.cos( H ) );
	let az = Math.atan2( - Math.sin( H ), Math.tan( dec ) * Math.cos( phi ) - Math.sin( phi ) * Math.cos( H ) );
	if ( az < 0 ) az += Math.PI * 2;

	// small refraction lift near the horizon
	const elDeg = el / rad;
	const refr = elDeg > - 1 ? 1.02 / Math.tan( ( elDeg + 10.3 / ( elDeg + 5.11 ) ) * rad ) / 60 : 0;
	const e = ( elDeg + refr ) * rad;

	const direction = new Vector3( Math.sin( az ) * Math.cos( e ), Math.sin( e ), - Math.cos( az ) * Math.cos( e ) );
	return { azimuth: az / rad, elevation: e / rad, direction };

}

const _warm = new Color( 1.0, 0.52, 0.22 );
const _gold = new Color( 1.0, 0.8, 0.58 );
const _day = new Color( 1.0, 0.96, 0.9 );

/** Approximate direct-sun colour and relative intensity after atmospheric extinction. */
export function sunLightColor( elevationDeg, target = new Color() ) {

	const t = MathUtils.clamp( elevationDeg / 40, 0, 1 );
	if ( t < 0.25 ) target.lerpColors( _warm, _gold, t / 0.25 );
	else target.lerpColors( _gold, _day, ( t - 0.25 ) / 0.75 );
	const airmass = 1 / ( Math.sin( Math.max( elevationDeg, 0.5 ) * rad ) + 0.15 * Math.pow( elevationDeg + 3.885, - 1.253 ) );
	const intensity = Math.exp( - 0.1 * ( airmass - 1 ) ) * MathUtils.smoothstep( elevationDeg, - 1.5, 3 );
	return { color: target, intensity };

}
