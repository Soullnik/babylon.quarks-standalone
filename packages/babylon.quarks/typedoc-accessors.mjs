// An accessor is documented once: TypeDoc shows the get and set signatures as one member, so the
// signature without a comment takes the other one's instead of asking for the same text twice.
import {Converter, ReflectionKind} from 'typedoc';

/** @param {import('typedoc').Application} app */
export function load(app) {
    app.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context) => {
        for (const accessor of context.project.getReflectionsByKind(ReflectionKind.Accessor)) {
            const getter = accessor.getSignature;
            const setter = accessor.setSignature;
            if (getter?.comment && setter && !setter.comment) {
                setter.comment = getter.comment.clone();
            } else if (setter?.comment && getter && !getter.comment) {
                getter.comment = setter.comment.clone();
            }
        }
    });
}
