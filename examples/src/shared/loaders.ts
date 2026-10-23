import {registerBuiltInLoaders} from '@babylonjs/loaders/dynamic';

// Babylon's file loaders, registered so each is fetched only when a file of its type is loaded.
// Importing `@babylonjs/loaders` itself would put every loader (glTF alone is ~1 MB with its
// extensions) into the pages that import it, whether or not they load a file.
registerBuiltInLoaders();
