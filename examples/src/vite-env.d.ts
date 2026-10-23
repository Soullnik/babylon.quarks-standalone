/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** The babylon.quarks version, set in `vite.config.ts` from the package's `package.json`. */
    readonly VITE_QUARKS_VERSION: string;
}
