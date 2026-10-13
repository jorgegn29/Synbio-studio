export type CommandCenterActionId =
    | 'command.generateBioScript'
    | 'command.compileCircuit'
    | 'command.simulateCircuit'
    | 'command.biosecurityScan'
    | 'command.sequenceAnalysis'
    | 'command.designPrimers'
    | 'command.predictFailures'
    | 'command.autoDocumentation'
    | 'command.newCircuit'
    | 'command.openExample'
    | 'command.protocol'
    | 'task.clientWatch'
    | 'task.clientBuild'
    | 'task.serverBuild'
    | 'terminal.workspace'
    | 'terminal.client'
    | 'terminal.server';

interface IntentRule {
    actionId: CommandCenterActionId;
    keywords: string[];
    phrases: string[];
}

export interface RankedBioScriptIntent {
    actionId: CommandCenterActionId;
    score: number;
    reason: string;
    matchedKeywords: string[];
    matchedPhrases: string[];
}

export type CommandCenterDeliveryMode = 'ask' | 'new-file' | 'insert' | 'clipboard' | 'show-full';

export interface ResolvedBioScriptCommandParameters {
    originalPrompt: string;
    normalizedPrompt: string;
    promptText: string;
    delivery: CommandCenterDeliveryMode;
    fileNameHint?: string;
    circuitNameHint?: string;
    hostHint?: string;
}

export const COMMAND_CENTER_INTENT_RULES: IntentRule[] = [
    {
        actionId: 'command.generateBioScript',
        keywords: ['genera', 'generar', 'bioscript', 'disena', 'circuito', 'llm', 'ia'],
        phrases: ['genera bioscript', 'crear bioscript', 'disena circuito', 'genera un circuito'],
    },
    {
        actionId: 'command.compileCircuit',
        keywords: ['compila', 'compilar', 'fasta', 'circuito'],
        phrases: ['compila el circuito', 'compilar circuito', 'exporta fasta'],
    },
    {
        actionId: 'command.simulateCircuit',
        keywords: ['simula', 'simular', 'gillespie', 'simulacion'],
        phrases: ['simula el circuito', 'ejecuta simulacion', 'corre simulacion'],
    },
    {
        actionId: 'command.biosecurityScan',
        keywords: ['bioseguridad', 'biosafety', 'riesgo', 'compliance', 'seguridad'],
        phrases: ['escaneo de bioseguridad', 'analiza riesgos', 'revisa compliance'],
    },
    {
        actionId: 'command.sequenceAnalysis',
        keywords: ['secuencia', 'gc', 'orf', 'orfs', 'repeats', 'analisis'],
        phrases: ['analiza la secuencia', 'analisis de secuencia', 'mira el gc'],
    },
    {
        actionId: 'command.designPrimers',
        keywords: ['primer', 'primers', 'oligo', 'oligos', 'gibson', 'golden'],
        phrases: ['disena primers', 'diseña primers', 'diseno de primers', 'design primers'],
    },
    {
        actionId: 'command.predictFailures',
        keywords: ['fallo', 'fallos', 'failure', 'errores', 'depura', 'troubleshoot'],
        phrases: ['predice fallos', 'depura el circuito', 'revisa por que falla'],
    },
    {
        actionId: 'command.autoDocumentation',
        keywords: ['documentacion', 'documenta', 'docs', 'reporte'],
        phrases: ['genera documentacion', 'crear docs', 'haz la documentacion'],
    },
    {
        actionId: 'command.newCircuit',
        keywords: ['nuevo', 'crear', 'circuito', 'plantilla'],
        phrases: ['nuevo circuito', 'crear circuito', 'abre plantilla'],
    },
    {
        actionId: 'command.openExample',
        keywords: ['ejemplo', 'demo', 'sample'],
        phrases: ['abre un ejemplo', 'open example', 'ver demo'],
    },
    {
        actionId: 'command.protocol',
        keywords: ['protocolo', 'laboratorio', 'lab', 'gibson', 'golden'],
        phrases: ['genera protocolo', 'protocolo de laboratorio', 'pasos de clonacion'],
    },
    {
        actionId: 'task.clientWatch',
        keywords: ['watch', 'cliente', 'client', 'frontend', 'extension'],
        phrases: ['watch del cliente', 'inicia watch', 'arranca watch'],
    },
    {
        actionId: 'task.clientBuild',
        keywords: ['build', 'cliente', 'client', 'frontend'],
        phrases: ['build client', 'compila el cliente', 'build del cliente'],
    },
    {
        actionId: 'task.serverBuild',
        keywords: ['build', 'server', 'servidor', 'cargo', 'backend'],
        phrases: ['build server', 'compila el servidor', 'build del server'],
    },
    {
        actionId: 'terminal.workspace',
        keywords: ['terminal', 'consola', 'shell', 'workspace'],
        phrases: ['abre terminal', 'abre una terminal', 'open terminal'],
    },
    {
        actionId: 'terminal.client',
        keywords: ['terminal', 'consola', 'client', 'cliente', 'frontend'],
        phrases: ['terminal client', 'terminal del cliente', 'abre terminal en client'],
    },
    {
        actionId: 'terminal.server',
        keywords: ['terminal', 'consola', 'server', 'servidor', 'backend'],
        phrases: ['terminal server', 'terminal del servidor', 'abre terminal en server'],
    },
];

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function keywordMatches(keyword: string, normalizedPrompt: string, tokens: Set<string>): boolean {
    if (keyword.includes(' ')) {
        return normalizedPrompt.includes(keyword);
    }

    return tokens.has(keyword) || normalizedPrompt.includes(keyword);
}

function buildReason(matchedKeywords: string[], matchedPhrases: string[]): string {
    const parts: string[] = [];

    if (matchedPhrases.length > 0) {
        parts.push(`frases: ${matchedPhrases.join(', ')}`);
    }

    if (matchedKeywords.length > 0) {
        parts.push(`keywords: ${matchedKeywords.join(', ')}`);
    }

    return parts.join(' · ');
}

function sanitizeFileStem(value: string): string {
    const normalized = normalizeText(value)
        .replace(/[^a-z0-9\s_-]/g, ' ')
        .replace(/[\s-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    return normalized || 'ai_generated_circuit';
}

function withBioExtension(stem: string): string {
    return stem.endsWith('.bio') ? stem : `${stem}.bio`;
}

function stripBioExtension(fileName: string): string {
    return fileName.replace(/\.bio$/i, '');
}

function extractExplicitFileName(prompt: string): string | undefined {
    const patterns = [
        /(?:archivo|file|fichero)\s+(?:nuevo\s+)?(?:llamado|named|nombre|como)?\s*["']?([A-Za-z0-9][A-Za-z0-9 _-]{0,48}(?:\.bio)?)/i,
        /(?:llamado|named|nombre)\s+(?:como\s+)?["']?([A-Za-z0-9][A-Za-z0-9 _-]{0,48}(?:\.bio)?)/i,
    ];

    for (const pattern of patterns) {
        const match = prompt.match(pattern);
        if (!match) {
            continue;
        }

        const candidate = match[1]
            .split(/\s+(?:para|con|en|y|que|del|de)\b/i)[0]
            .trim()
            .replace(/["'.,;:!?]+$/g, '');

        if (!candidate) {
            continue;
        }

        const hasBioExtension = /\.bio$/i.test(candidate);
        const stemSource = hasBioExtension ? candidate.replace(/\.bio$/i, '') : candidate;
        const sanitizedStem = sanitizeFileStem(stemSource);
        return hasBioExtension ? `${sanitizedStem}.bio` : withBioExtension(sanitizedStem);
    }

    return undefined;
}

function deriveFileStemFromPrompt(prompt: string): string {
    const stopwords = new Set([
        'genera', 'generar', 'crear', 'crea', 'haz', 'bioscript', 'circuito', 'circuit',
        'archivo', 'file', 'nuevo', 'nueva', 'para', 'con', 'sin', 'una', 'uno', 'que',
        'desde', 'prompt', 'llamado', 'named', 'nombre', 'como', 'quiero', 'necesito',
        'disena', 'disenar', 'diseña', 'diseñar', 'abre', 'abrir', 'bio', 'del', 'de',
    ]);

    const tokens = normalizeText(prompt)
        .split(' ')
        .filter(token => token.length >= 3 && !stopwords.has(token));

    const uniqueTokens = [...new Set(tokens)].slice(0, 6);
    return sanitizeFileStem(uniqueTokens.join('_') || 'ai_generated_circuit');
}

function extractHostHint(normalizedPrompt: string): string | undefined {
    const hostPatterns: Array<[RegExp, string]> = [
        [/dh5alpha|dh5a/, 'ecoli_dh5alpha'],
        [/bl21/, 'ecoli_bl21'],
        [/mg1655/, 'ecoli_mg1655'],
        [/nissle/, 'ecoli_nissle1917'],
        [/k12|e coli|ecoli/, 'ecoli_k12'],
        [/yeast|levadura|s288c/, 'yeast_s288c'],
        [/by4741/, 'yeast_by4741'],
        [/bacillus/, 'bacillus_subtilis_168'],
        [/putida/, 'pseudomonas_putida_kt2440'],
        [/glutamicum/, 'corynebacterium_glutamicum'],
        [/hek293/, 'human_hek293'],
        [/cho/, 'cho_k1'],
    ];

    for (const [pattern, host] of hostPatterns) {
        if (pattern.test(normalizedPrompt)) {
            return host;
        }
    }

    return undefined;
}

function resolveDeliveryMode(actionId: CommandCenterActionId, normalizedPrompt: string): CommandCenterDeliveryMode {
    if (actionId === 'command.generateBioScript') {
        if (/(inserta|insertar|editor)/.test(normalizedPrompt)) {
            return 'insert';
        }

        if (/(copia|copiar|portapapeles|clipboard)/.test(normalizedPrompt)) {
            return 'clipboard';
        }

        if (/(muestra|mostrar|completo|output|respuesta)/.test(normalizedPrompt)) {
            return 'show-full';
        }

        return 'new-file';
    }

    if (actionId === 'command.newCircuit') {
        return 'new-file';
    }

    return 'ask';
}

export function resolveBioScriptCommandParameters(
    prompt: string,
    actionId: CommandCenterActionId,
): ResolvedBioScriptCommandParameters {
    const normalizedPrompt = normalizeText(prompt);
    const explicitFileName = extractExplicitFileName(prompt);
    const derivedFileName = withBioExtension(deriveFileStemFromPrompt(prompt));
    const needsFileName = actionId === 'command.generateBioScript' || actionId === 'command.newCircuit';
    const fileNameHint = needsFileName ? (explicitFileName ?? derivedFileName) : undefined;

    return {
        originalPrompt: prompt,
        normalizedPrompt,
        promptText: prompt.trim(),
        delivery: resolveDeliveryMode(actionId, normalizedPrompt),
        fileNameHint,
        circuitNameHint: fileNameHint ? stripBioExtension(fileNameHint) : undefined,
        hostHint: extractHostHint(normalizedPrompt),
    };
}

export function rankBioScriptCommandIntents(prompt: string, limit = 5): RankedBioScriptIntent[] {
    const normalizedPrompt = normalizeText(prompt);
    if (!normalizedPrompt) {
        return [];
    }

    const tokens = new Set(normalizedPrompt.split(' '));

    const ranked = COMMAND_CENTER_INTENT_RULES
        .map<RankedBioScriptIntent | undefined>((rule) => {
            const matchedKeywords = rule.keywords.filter(keyword => keywordMatches(keyword, normalizedPrompt, tokens));
            const matchedPhrases = rule.phrases.filter(phrase => normalizedPrompt.includes(normalizeText(phrase)));

            let score = matchedKeywords.length * 2 + matchedPhrases.length * 4;

            if (rule.actionId.startsWith('terminal.') && normalizedPrompt.includes('terminal')) {
                score += 1;
            }

            if (rule.actionId.startsWith('task.') && normalizedPrompt.includes('build')) {
                score += 1;
            }

            if (rule.actionId === 'command.generateBioScript' && normalizedPrompt.includes('bioscript')) {
                score += 2;
            }

            if (score === 0) {
                return undefined;
            }

            return {
                actionId: rule.actionId,
                score,
                reason: buildReason(matchedKeywords, matchedPhrases),
                matchedKeywords,
                matchedPhrases,
            };
        })
        .filter((intent): intent is RankedBioScriptIntent => intent !== undefined)
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }

            return left.actionId.localeCompare(right.actionId);
        });

    return ranked.slice(0, limit);
}

export function inferBioScriptCommand(prompt: string): RankedBioScriptIntent | undefined {
    return rankBioScriptCommandIntents(prompt, 1)[0];
}