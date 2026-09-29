// Device capability tiers + dynamic resolution.

const TIERS = {
	low: {
		name: 'low', pixelRatio: 1, maxPixels: 1.1e6, shadowMapSize: 1024, shadowFar: 140,
		ao: false, traa: false, fxaa: true, dof: false, bloom: true, grain: true,
		grassDensity: 0, treeDensity: 0.55, splats: false, reflections: false,
		birds: 16, cars: 18, people: 20, envProbe: false, statueLod: 1
	},
	medium: {
		name: 'medium', pixelRatio: 1.25, maxPixels: 2.1e6, shadowMapSize: 2048, shadowFar: 200,
		ao: false, traa: true, fxaa: false, dof: true, bloom: true, grain: true,
		grassDensity: 0.45, treeDensity: 0.8, splats: true, reflections: false,
		birds: 26, cars: 34, people: 40, envProbe: true, statueLod: 0
	},
	high: {
		name: 'high', pixelRatio: 1.5, maxPixels: 3.8e6, shadowMapSize: 4096, shadowFar: 260,
		ao: true, traa: true, fxaa: false, dof: true, bloom: true, grain: true,
		grassDensity: 1, treeDensity: 1, splats: true, reflections: true,
		birds: 40, cars: 50, people: 60, envProbe: true, statueLod: 0
	}
};

export function detectQuality( hasWebGPU ) {

	const q = new URLSearchParams( location.search ).get( 'q' );
	if ( q && TIERS[ q ] ) return { ...TIERS[ q ] };

	const ua = navigator.userAgent;
	const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test( ua ) || ( navigator.maxTouchPoints > 1 && /Macintosh/.test( ua ) );
	const mem = navigator.deviceMemory || 8;
	const cores = navigator.hardwareConcurrency || 8;

	let tier = 'high';
	if ( ! hasWebGPU ) tier = mobile ? 'low' : 'medium';
	else if ( mobile ) tier = mem >= 6 && cores >= 8 ? 'medium' : 'low';
	else if ( mem < 8 || cores < 6 ) tier = 'medium';
	return { ...TIERS[ tier ] };

}

/**
 * Adjusts the render scale towards a target frame time. Rendering cost scales
 * with pixel count, so we move in small steps and only after sustained drift.
 */
export class DynamicResolution {

	constructor( renderer, quality, targetMs = 1000 / 55 ) {

		this.renderer = renderer;
		this.quality = quality;
		this.targetMs = targetMs;
		this.max = Math.min( window.devicePixelRatio || 1, quality.pixelRatio );
		this.min = Math.min( this.max, 0.6 );
		this.scale = this.max;
		this.avg = targetMs;
		this.cooldown = 90;
		this.enabled = true;

	}

	clampToBudget( ratio ) {

		const px = window.innerWidth * window.innerHeight;
		return Math.min( ratio, Math.sqrt( this.quality.maxPixels / px ) );

	}

	initial() {

		this.scale = this.clampToBudget( this.max );
		return this.scale;

	}

	update( dtMs ) {

		if ( ! this.enabled ) return false;
		this.avg += ( Math.min( dtMs, 100 ) - this.avg ) * 0.05;
		if ( -- this.cooldown > 0 ) return false;
		let next = this.scale;
		if ( this.avg > this.targetMs * 1.18 ) next = Math.max( this.min, this.scale * 0.9 );
		else if ( this.avg < this.targetMs * 0.8 ) next = Math.min( this.clampToBudget( this.max ), this.scale * 1.06 );
		if ( Math.abs( next - this.scale ) > 0.01 ) {

			this.scale = next;
			this.cooldown = 60;
			return true;

		}

		return false;

	}

}
