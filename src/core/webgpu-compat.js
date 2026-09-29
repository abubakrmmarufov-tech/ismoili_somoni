// three r186 always passes `swizzle: 'rgba'` to GPUTexture.createView(). Chrome
// builds that shipped the earlier dictionary form of `swizzle` reject that
// string, which aborts rendering. The identity swizzle is the default anyway,
// so dropping it is lossless on every implementation.

if ( typeof GPUTexture !== 'undefined' && ! GPUTexture.prototype.__somoniPatched ) {

	const createView = GPUTexture.prototype.createView;
	GPUTexture.prototype.createView = function ( descriptor ) {

		if ( descriptor && descriptor.swizzle === 'rgba' ) delete descriptor.swizzle;
		return createView.call( this, descriptor );

	};

	GPUTexture.prototype.__somoniPatched = true;

}
