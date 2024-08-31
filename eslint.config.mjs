// @ts-check
import globals from 'globals';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// ESLint options
export default tseslint.config(
    // ESLint recommended rules
    eslint.configs.recommended,
    // typescript-eslint strict and stylistic rules
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    {
        languageOptions: {
            globals:        globals.node,
            ecmaVersion:    'latest',
            sourceType:     'module',
            parserOptions: {
                projectService:         { allowDefaultProject: ['*.mjs', '*.ts'] },
                allowDefaultProject:    true
            }
        },
        rules: {
            quotes:                                     ['warn', 'single', { avoidEscape: true }],
            semi:                                       ['warn'],
            'comma-dangle':                             ['warn', 'never'],
            'dot-notation':                             ['off'],
            eqeqeq:                                     ['warn'],
            curly:                                      ['off'],
            'brace-style':                              ['warn', '1tbs', { allowSingleLine: true }],
            'prefer-arrow-callback':                    ['warn'],
            'max-len':                                  ['warn', 140],
            'comma-spacing':                            ['error'],
            'no-trailing-spaces':                       ['warn'],
            'lines-between-class-members':              ['warn', 'always', { exceptAfterSingleLine:  true }],
            '@typescript-eslint/no-unused-vars':        ['error', { args: 'all', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
            '@typescript-eslint/no-floating-promises':  ['error', {}],
            '@typescript-eslint/no-misused-promises':   ['error', {}],
            '@typescript-eslint/unified-signatures':    ['error', { ignoreDifferentlyNamedParameters: true }],
            indent:                                     ['warn', 4, {
                SwitchCase:             0,
                FunctionDeclaration:    { parameters:   'first' },
                FunctionExpression:     { parameters:   'first' },
                CallExpression:         { arguments:    'first' },
                ImportDeclaration:      'first',
                ArrayExpression:        'first',
                ignoredNodes:           ['ConditionalExpression']
            }]
        }
    }, {
        ignores: [ '**/ti/' ]
    }
);