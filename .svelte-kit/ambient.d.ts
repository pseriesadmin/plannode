
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const VITE_SUPABASE_URL: string;
	export const VITE_SUPABASE_ANON_KEY: string;
	export const _ZO_DOCTOR: string;
	export const NVM_INC: string;
	export const GOMODCACHE: string;
	export const PUPPETEER_CACHE_DIR: string;
	export const VSCODE_CRASH_REPORTER_PROCESS_TYPE: string;
	export const NODE: string;
	export const INIT_CWD: string;
	export const socks5_proxy: string;
	export const SOCKS5_PROXY: string;
	export const NVM_CD_FLAGS: string;
	export const TERM: string;
	export const SHELL: string;
	export const VSCODE_PROCESS_TITLE: string;
	export const TMPDIR: string;
	export const npm_config_global_prefix: string;
	export const CURSOR_WORKSPACE_LABEL: string;
	export const PIP_CACHE_DIR: string;
	export const MallocNanoZone: string;
	export const COLOR: string;
	export const NO_COLOR: string;
	export const npm_config_noproxy: string;
	export const npm_config_local_prefix: string;
	export const CURSOR_LAYOUT: string;
	export const NO_PROXY: string;
	export const http_proxy: string;
	export const USER: string;
	export const NX_CACHE_DIRECTORY: string;
	export const NVM_DIR: string;
	export const CYPRESS_CACHE_FOLDER: string;
	export const COMMAND_MODE: string;
	export const CCACHE_DIR: string;
	export const npm_config_globalconfig: string;
	export const YARN_CACHE_FOLDER: string;
	export const SSH_AUTH_SOCK: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const npm_execpath: string;
	export const BUN_INSTALL_CACHE_DIR: string;
	export const HOMEBREW_CACHE: string;
	export const ELECTRON_RUN_AS_NODE: string;
	export const all_proxy: string;
	export const ALL_PROXY: string;
	export const npm_config_devdir: string;
	export const PATH: string;
	export const CURSOR_SANDBOX: string;
	export const npm_package_json: string;
	export const _: string;
	export const npm_config_userconfig: string;
	export const npm_config_init_module: string;
	export const __CFBundleIdentifier: string;
	export const npm_command: string;
	export const PWD: string;
	export const CP_HOME_DIR: string;
	export const socks_proxy: string;
	export const VSCODE_HANDLES_UNCAUGHT_ERRORS: string;
	export const SOCKS_PROXY: string;
	export const npm_lifecycle_event: string;
	export const EDITOR: string;
	export const VSCODE_ESM_ENTRYPOINT: string;
	export const npm_package_name: string;
	export const CURSOR_AGENT: string;
	export const CONDA_PKGS_DIRS: string;
	export const GIT_HTTP_PROXY: string;
	export const npm_config_npm_version: string;
	export const XPC_FLAGS: string;
	export const PLAYWRIGHT_BROWSERS_PATH: string;
	export const CURSOR_EXTENSION_HOST_ROLE: string;
	export const MACH_PORT_RENDEZVOUS_PEER_VALDATION: string;
	export const FORCE_COLOR: string;
	export const npm_config_node_gyp: string;
	export const https_proxy: string;
	export const HTTPS_PROXY: string;
	export const GEM_SPEC_CACHE: string;
	export const npm_package_version: string;
	export const XPC_SERVICE_NAME: string;
	export const SHLVL: string;
	export const HOME: string;
	export const GRADLE_USER_HOME: string;
	export const CURSOR_ORIG_UID: string;
	export const VSCODE_NLS_CONFIG: string;
	export const no_proxy: string;
	export const PNPM_STORE_PATH: string;
	export const HTTP_PROXY: string;
	export const BUNDLE_PATH: string;
	export const TURBO_CACHE_DIR: string;
	export const NUGET_PACKAGES: string;
	export const NPM_CONFIG_CACHE: string;
	export const LOGNAME: string;
	export const GIT_HTTPS_PROXY: string;
	export const CURSOR_ORIG_GID: string;
	export const npm_lifecycle_script: string;
	export const GOCACHE: string;
	export const VSCODE_IPC_HOOK: string;
	export const VSCODE_CODE_CACHE_PATH: string;
	export const NVM_BIN: string;
	export const npm_config_user_agent: string;
	export const VSCODE_PID: string;
	export const CARGO_TARGET_DIR: string;
	export const POETRY_CACHE_DIR: string;
	export const COMPOSER_HOME: string;
	export const VSCODE_CWD: string;
	export const UV_CACHE_DIR: string;
	export const npm_node_execpath: string;
	export const npm_config_prefix: string;
	export const __CURSOR_SANDBOX_ENV_RESTORE: string;
	export const NODE_ENV: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		VITE_SUPABASE_URL: string;
		VITE_SUPABASE_ANON_KEY: string;
		_ZO_DOCTOR: string;
		NVM_INC: string;
		GOMODCACHE: string;
		PUPPETEER_CACHE_DIR: string;
		VSCODE_CRASH_REPORTER_PROCESS_TYPE: string;
		NODE: string;
		INIT_CWD: string;
		socks5_proxy: string;
		SOCKS5_PROXY: string;
		NVM_CD_FLAGS: string;
		TERM: string;
		SHELL: string;
		VSCODE_PROCESS_TITLE: string;
		TMPDIR: string;
		npm_config_global_prefix: string;
		CURSOR_WORKSPACE_LABEL: string;
		PIP_CACHE_DIR: string;
		MallocNanoZone: string;
		COLOR: string;
		NO_COLOR: string;
		npm_config_noproxy: string;
		npm_config_local_prefix: string;
		CURSOR_LAYOUT: string;
		NO_PROXY: string;
		http_proxy: string;
		USER: string;
		NX_CACHE_DIRECTORY: string;
		NVM_DIR: string;
		CYPRESS_CACHE_FOLDER: string;
		COMMAND_MODE: string;
		CCACHE_DIR: string;
		npm_config_globalconfig: string;
		YARN_CACHE_FOLDER: string;
		SSH_AUTH_SOCK: string;
		__CF_USER_TEXT_ENCODING: string;
		npm_execpath: string;
		BUN_INSTALL_CACHE_DIR: string;
		HOMEBREW_CACHE: string;
		ELECTRON_RUN_AS_NODE: string;
		all_proxy: string;
		ALL_PROXY: string;
		npm_config_devdir: string;
		PATH: string;
		CURSOR_SANDBOX: string;
		npm_package_json: string;
		_: string;
		npm_config_userconfig: string;
		npm_config_init_module: string;
		__CFBundleIdentifier: string;
		npm_command: string;
		PWD: string;
		CP_HOME_DIR: string;
		socks_proxy: string;
		VSCODE_HANDLES_UNCAUGHT_ERRORS: string;
		SOCKS_PROXY: string;
		npm_lifecycle_event: string;
		EDITOR: string;
		VSCODE_ESM_ENTRYPOINT: string;
		npm_package_name: string;
		CURSOR_AGENT: string;
		CONDA_PKGS_DIRS: string;
		GIT_HTTP_PROXY: string;
		npm_config_npm_version: string;
		XPC_FLAGS: string;
		PLAYWRIGHT_BROWSERS_PATH: string;
		CURSOR_EXTENSION_HOST_ROLE: string;
		MACH_PORT_RENDEZVOUS_PEER_VALDATION: string;
		FORCE_COLOR: string;
		npm_config_node_gyp: string;
		https_proxy: string;
		HTTPS_PROXY: string;
		GEM_SPEC_CACHE: string;
		npm_package_version: string;
		XPC_SERVICE_NAME: string;
		SHLVL: string;
		HOME: string;
		GRADLE_USER_HOME: string;
		CURSOR_ORIG_UID: string;
		VSCODE_NLS_CONFIG: string;
		no_proxy: string;
		PNPM_STORE_PATH: string;
		HTTP_PROXY: string;
		BUNDLE_PATH: string;
		TURBO_CACHE_DIR: string;
		NUGET_PACKAGES: string;
		NPM_CONFIG_CACHE: string;
		LOGNAME: string;
		GIT_HTTPS_PROXY: string;
		CURSOR_ORIG_GID: string;
		npm_lifecycle_script: string;
		GOCACHE: string;
		VSCODE_IPC_HOOK: string;
		VSCODE_CODE_CACHE_PATH: string;
		NVM_BIN: string;
		npm_config_user_agent: string;
		VSCODE_PID: string;
		CARGO_TARGET_DIR: string;
		POETRY_CACHE_DIR: string;
		COMPOSER_HOME: string;
		VSCODE_CWD: string;
		UV_CACHE_DIR: string;
		npm_node_execpath: string;
		npm_config_prefix: string;
		__CURSOR_SANDBOX_ENV_RESTORE: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
