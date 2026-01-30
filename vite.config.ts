import { defineConfig } from 'vite';
import { VitePluginNode } from 'vite-plugin-node';
import replace from '@rollup/plugin-replace';
import { spawnSync } from 'node:child_process';
import dts from 'vite-plugin-dts';

let gitInfo = {
    branch: '',
    commit: '',
    tags: '',
    commitDate: '',
};

function execGitCommand(args: string[]): string {
    const result = spawnSync('git', args, {
        encoding: 'utf8',
        shell: false,
    });
    if (result.error || result.status !== 0) {
        throw result.error || new Error(`git command failed: ${args.join(' ')}`);
    }
    return result.stdout.trim();
}

try {
    gitInfo = {
        branch: execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']),
        commit: execGitCommand(['rev-parse', '--short', 'HEAD']),
        tags: '',
        commitDate: execGitCommand(['log', '-1', '--format=%cd', '--date=iso']),
    };

    try {
        const tagsResult = spawnSync('git', ['tag', '--points-at', 'HEAD'], {
            encoding: 'utf8',
            shell: false,
        });
        if (tagsResult.status === 0 && tagsResult.stdout) {
            gitInfo.tags = tagsResult.stdout.trim().split('\n').filter(Boolean).join(',');
        }
    } catch {
        gitInfo.tags = '';
    }
} catch {
    // eslint-disable-next-line no-console
    console.log('Directory does not have a Git repository, skipping git info');
}


export default defineConfig({
    server: {
        port: 3000
    },
    plugins: [
        ...VitePluginNode({
            adapter: 'express',
            appPath: './src/index.ts',
            exportName: 'viteNodeApp',
            tsCompiler: 'swc',
            swcOptions: {
                sourceMaps: true,
            },
        }),
        replace({
            '__VERSION__': process.env.npm_package_version,
            '__GIT_BRANCH__': gitInfo.branch,
            '__GIT_COMMIT__': gitInfo.commit,
            '__GIT_TAGS__': gitInfo.tags === '' ? '' : `T:${gitInfo.tags}`,
            '__GIT_COMMIT_DATE__': gitInfo.commitDate,
            '__SYSTEM_INFO__': `${process.platform} ${process.arch} ${process.version}`,
            preventAssignment: true,
        }),
        dts({
            entryRoot: 'src',
            outDir: 'dist',
            exclude: ['**/*.test.ts'],
            include: ['**/*.ts'],
        }),
    ],
    build: {
        target: 'esnext',
        outDir: 'dist',
        lib: {
            entry: './src/index.ts',
        },
        rollupOptions: {
            input: 'src/index.ts',
            output: [
                {
                    format: 'es',
                    entryFileNames: '[name].js',
                    chunkFileNames: '[name].js',
                    preserveModules: true,
                    preserveModulesRoot: 'src',
                    exports: 'named',
                },
                {
                    format: 'cjs',
                    entryFileNames: 'index.cjs',
                    chunkFileNames: '[name].cjs',
                    preserveModules: false,
                    exports: 'named',
                },
            ],
            external: [
                // Node built-ins (with and without node: prefix)
                /^node:/,
                // External dependencies
                'zod',
            ],
        },
        modulePreload: false,
        minify: false,
        sourcemap: true
    },
});
