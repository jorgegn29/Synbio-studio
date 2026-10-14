import phrases from './en-phrases.json';

export type Lang = 'es' | 'en';

export const STORAGE_KEY = 'synbio-studio-lang';

export const PHRASES: Record<string, string> = phrases;

export function parseLang(value: unknown): Lang | null {
  return value === 'es' || value === 'en' ? value : null;
}

/** Stored choice wins. Otherwise Spanish only when the browser/editor language is Spanish. */
export function chooseLang(stored: unknown, navigatorLanguage: string | undefined): Lang {
  const parsed = parseLang(stored);
  if (parsed) return parsed;
  if ((navigatorLanguage || '').toLowerCase().startsWith('es')) return 'es';
  return 'en';
}

/** VS Code setting `synbio.uiLanguage`: en/es win; auto and anything else follow the editor language. */
export function extensionLang(vscodeLanguage: string | undefined, configured: unknown): Lang {
  const explicit = parseLang(configured);
  if (explicit) return explicit;
  return chooseLang(null, vscodeLanguage);
}

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function browserStorage(): StorageLike | null {
  const host = globalThis as { localStorage?: StorageLike };
  const storage = host.localStorage;
  if (!storage || typeof storage.getItem !== 'function') return null;
  return storage;
}

export function readStoredLang(): Lang | null {
  const storage = browserStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = parseLang(raw);
    if (raw != null && raw !== '' && !parsed) storage.removeItem(STORAGE_KEY);
    return parsed;
  } catch {
    return null;
  }
}

export function writeLang(lang: Lang): void {
  if (lang !== 'es' && lang !== 'en') return;
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode or a full quota */
  }
}

function withEdges(original: string, mapped: string): string {
  const lead = original.match(/^\s*/)?.[0] ?? '';
  const trail = original.match(/\s*$/)?.[0] ?? '';
  if (lead.length + trail.length >= original.length) return original;
  return `${lead}${mapped}${trail}`;
}

export function translate(text: string, lang: Lang): string {
  if (lang !== 'en' || !text) return text;
  const trimmed = text.trim();
  const mapped = PHRASES[trimmed];
  if (!mapped) return text;
  return withEdges(text, mapped);
}

const LINE_RULES: Array<{ re: RegExp; to: (match: RegExpMatchArray) => string }> = [
  { re: /^Proyecto abierto\. Archivo (.+)\.$/, to: m => `Project opened. File ${m[1]}.` },
  { re: /^Nuevo BioScript (.+)\.$/, to: m => `New BioScript ${m[1]}.` },
  { re: /^Ejemplo (.+) cargado en (.+)\.$/, to: m => `Example ${m[1]} loaded in ${m[2]}.` },
  { re: /^CSV (.+) importado\.$/, to: m => `CSV ${m[1]} imported.` },
  { re: /^Archivo (.+) abierto \((\d+) caracteres\)\.$/, to: m => `File ${m[1]} opened (${m[2]} characters).` },
  { re: /^FCS (.+): segmento TEXT leído\. No hay gráfico de eventos\.$/, to: m => `FCS ${m[1]}: TEXT segment read. There is no event plot.` },
  {
    re: /^Compilado (.+): (sin errores|con errores), (\d+) circuitos, (\d+) diagnósticos, (\d+) ms\.$/,
    to: m => `Compiled ${m[1]}: ${m[2] === 'sin errores' ? 'no errors' : 'with errors'}, ${m[3]} circuits, ${m[4]} diagnostics, ${m[5]} ms.`,
  },
  { re: /^ODE Euler 2 h, (\d+) muestras\. No es el solver scipy del motor Python\.$/, to: m => `ODE Euler 2 h, ${m[1]} samples. This is not the Python engine scipy solver.` },
  { re: /^Gillespie SSA: (\d+) reacciones, t=(.+) s\.$/, to: m => `Gillespie SSA: ${m[1]} reactions, t=${m[2]} s.` },
  { re: /^Validación ([^:]+): (.+)$/, to: m => `Validation ${m[1]}: ${m[2]}` },
  { re: /^Herramienta (.+) ejecutada \((\d+) caracteres\)\.$/, to: m => `Tool ${m[1]} ran (${m[2]} characters).` },
  { re: /^Localizar línea (\d+)\.$/, to: m => `Locate line ${m[1]}.` },
  { re: /^Descarga (.+)\.$/, to: m => `Download ${m[1]}.` },
  { re: /^Pieza (.+) insertada en (.+)\.$/, to: m => `Part ${m[1]} inserted in ${m[2]}.` },
  { re: /^Gatillo registrado: (.+) → (.+)\. No ejecuta un laboratorio\.$/, to: m => `Trigger recorded: ${m[1]} → ${m[2]}. It does not run a lab.` },
  { re: /^Marcador (.+):(\d+)\.$/, to: m => `Bookmark ${m[1]}:${m[2]}.` },
  { re: /^Revisión local (.+) \((.+)\): (.+)\. No es un commit de git\.$/, to: m => `Local revision ${m[1]} (${m[2]}): ${m[3]}. This is not a git commit.` },
  { re: /^Rama local «(.+)»\. No hay repositorio git en el navegador\.$/, to: m => `Local branch "${m[1]}". There is no git repository in the browser.` },
  { re: /^Etiqueta local (.+)\.$/, to: m => `Local tag ${m[1]}.` },
  { re: /^DBTL Design: rama local (.+)\.$/, to: m => `DBTL Design: local branch ${m[1]}.` },
  { re: /^Build local: (\d+) pasos\.$/, to: m => `Local build: ${m[1]} steps.` },
  { re: /^Secuencia de (.+) copiada\.$/, to: m => `Sequence of ${m[1]} copied.` },
  { re: /^SVG del mapa de plásmido descargado\.$/, to: () => 'Plasmid map SVG downloaded.' },
  { re: /^Simular del panel Vista Circuito ejecutó Gillespie SSA en el navegador\.$/, to: () => 'Simulate from the Circuit View panel ran Gillespie SSA in the browser.' },
  { re: /^Panel (.+): (.+)$/, to: m => `Panel ${m[1]}: ${m[2]}` },
  { re: /^Flujo activo: (.+)\. Ejemplos disponibles: (.+)\.$/, to: m => `Active flow: ${m[1]}. Available examples: ${m[2]}.` },
  { re: /^(\d+) archivos · rama local (.+)$/, to: m => `${m[1]} files · local branch ${m[2]}` },
  { re: /^Scripts en proceso (\d+) · En cola (\d+) · Iteraciones (\d+) · Errores (\d+)$/, to: m => `Scripts running ${m[1]} · Queued ${m[2]} · Iterations ${m[3]} · Errors ${m[4]}` },
  { re: /^Inducción ([0-9.]+) cambia el brillo del citosol\. Fuerza ([0-9.]+) es un factor de vista, no un RPU medido\. (-?\d+) °C no ajusta un modelo de crecimiento\.$/, to: m => `Induction ${m[1]} changes cytosol brightness. Strength ${m[2]} is a view factor, not a measured RPU. ${m[3]} °C does not tune a growth model.` },
  { re: /^Fenotipo del circuito: (.+)\. El color del citoplasma sale del marcador compilado\.$/, to: m => `Circuit phenotype: ${m[1]}. Cytoplasm color comes from the compiled marker.` },
  { re: /^XYZ esquemático (.+)$/, to: m => `Schematic XYZ ${m[1]}` },
  { re: /^Tamaño (.+)$/, to: m => `Size ${PHRASES[m[1]] || m[1]}` },
  { re: /^Visible: (sí|no)$/, to: m => `Visible: ${m[1] === 'sí' ? 'yes' : 'no'}` },
];

export function translateLine(line: string, lang: Lang): string {
  if (lang !== 'en' || !line) return line;
  const exact = translate(line, lang);
  if (exact !== line) return exact;
  const trimmed = line.trim();
  for (const rule of LINE_RULES) {
    const match = trimmed.match(rule.re);
    if (match) return withEdges(line, rule.to(match));
  }
  return line;
}
