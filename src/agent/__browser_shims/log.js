export function log(rec){ try{ console.debug('[freddie]', rec) }catch{} }
export function logger(subsystem){
    return {
        debug: (msg, e={}) => console.debug('[freddie:'+subsystem+']', msg, e),
        info:  (msg, e={}) => console.log('[freddie:'+subsystem+']', msg, e),
        warn:  (msg, e={}) => console.warn('[freddie:'+subsystem+']', msg, e),
        error: (msg, e={}) => console.error('[freddie:'+subsystem+']', msg, e),
    }
}
export function closeAll(){}
