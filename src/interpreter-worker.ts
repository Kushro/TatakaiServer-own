import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import wasm from './quickjs.wasm';
import { createInterpreter } from './interpreter';
export const interpreter = createInterpreter(() => newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmModule: wasm })));
