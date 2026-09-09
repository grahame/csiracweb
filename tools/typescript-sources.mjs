/**
 * Letting a tool import the emulator's TypeScript directly.
 *
 * Node runs TypeScript by stripping the types out of it, which is all these
 * tools need — but it resolves `import "./codes"` the way the web does, by
 * looking for exactly that file, and the emulator is written the way
 * TypeScript does, without the extension. Vite supplies the `.ts` in the
 * browser and in the tests; this supplies it under node, so that a tool can
 * run the real machine rather than a copy of it.
 *
 *   node --import ./tools/typescript-sources.mjs tools/make-og.mjs
 */

import { registerHooks } from "node:module";

registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (err) {
            if (!specifier.startsWith(".") || /\.[a-z]+$/i.test(specifier)) throw err;
            return nextResolve(`${specifier}.ts`, context);
        }
    },
});
