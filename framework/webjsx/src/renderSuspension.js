export function definesRenderSuspension(el) {
    return !!el.__webjsx_suspendRendering;
}
export function withRenderSuspension(el, callback) {
    const isRenderingSuspended = !!el
        .__webjsx_suspendRendering;
    if (isRenderingSuspended) {
        el.__webjsx_suspendRendering();
    }
    try {
        return callback();
    }
    finally {
        if (isRenderingSuspended) {
            el.__webjsx_resumeRendering();
        }
    }
}
